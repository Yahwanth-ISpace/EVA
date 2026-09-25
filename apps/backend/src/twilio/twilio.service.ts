import { HttpException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as FormData from 'form-data';
import { AgentDto } from 'src/schedular/dto/agent.dto';

const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? '').trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN ?? '').trim();
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const backendBaseUrl = process.env.BACKEND_URL;
const apiToken = process.env.VERIFICATIONS_API_TOKEN?.trim();

const client = twilio(accountSid, authToken);

/** In-memory map: call SID → stream context when Twilio omits query params on the WebSocket URL. */
export type CallStreamContext = {
  PatientID: string;
  AppointmentID: string | null;
  AgentId: string;
};

const callSidToStreamContext = new Map<string, CallStreamContext>();

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  /** Verification calls already redirected into a barge conference (idempotent bridge). */
  private readonly verificationCallsBridgedToConference = new Set<string>();
  /**
   * Resolve payeeId + optional appointmentId for an outbound call from its Twilio call SID.
   * Used when the media stream WebSocket URL omits query params.
   */
  getStreamContextForCall(callSid: string | null) {
    if (!callSid?.trim()) return null;

    return callSidToStreamContext.get(callSid) ?? null;
  }

  removeStreamContext(callSid: string | null) {
    if (!callSid?.trim()) return;

    callSidToStreamContext.delete(callSid);
  }

  /** @deprecated Prefer getStreamContextForCall */
  getPayeeIdForCall(callSid: string | null): string | null {
    return this.getStreamContextForCall(callSid)?.PatientID ?? null;
  }

  /**
   * Legacy step prompts (TwiML /twilio/step flow only). Main EVA flow uses media-stream + getNextConversationTurn.
   * Reena from Went Dentals; collects coverage, deductible, copay, validity. Values stored as $ for dollars, % for percent.
   */
  steps: string[] = [
    'Hi, I am Reena from Went Dentals. How are you doing today?',
    'I want to verify the benefits of a patient.',
    'Can I get the coverage?',
    'Can you provide the deductible?',
    'What is the copay?',
    'What is the validity of the insurance?',
    "Thank you for confirming the details. That's all I have. Have a good day.",
  ];

  /**
   * Hang up an active call by SID (e.g. when EVA has collected all details).
   */
  async hangUp(callSid: string): Promise<void> {
    if (!callSid?.trim()) return;
    await client.calls(callSid).update({ status: 'completed' });
  }

  /**
   * Redirect an in-progress call to a new TwiML URL (e.g. TPA IVR DTMF then reconnect stream).
   */
  async redirectCall(callSid: string, twimlUrl: string): Promise<void> {
    if (!callSid?.trim() || !twimlUrl?.trim()) return;
    await client.calls(callSid).update({ url: twimlUrl, method: 'POST' });
  }

  /**
   * Put an in-progress call on hold via Twilio REST: redirect to TwiML that plays hold music in a loop.
   * Note: this replaces the current TwiML (e.g. `<Connect><Stream>` ends; resume by redirecting back to your stream URL).
   */
  async putCallOnHold(callSid: string): Promise<void> {
    if (!callSid?.trim()) return;
    if (!backendBaseUrl?.trim()) {
      throw new Error('BACKEND_URL environment variable is not set.');
    }
    const base = backendBaseUrl.replace(/\/+$/, '');
    const holdUrl = `${base}/twilio/hold-music`;
    await client.calls(callSid).update({ url: holdUrl, method: 'POST' });
  }

  /** Stable conference name for a verification call SID (Twilio-safe characters only). */
  conferenceNameForCall(callSid: string): string {
    const sid = callSid.trim().replace(/\W/g, '');
    return `eva-barge-${sid}`.slice(0, 128);
  }

  /**
   * Human supervisor barge-in: dial supervisor first; when they answer, bridge the TPA leg into
   * the same conference (ends EVA media stream at bridge time). EVA should be silenced before this runs.
   */
  async bargeInSupervisor(
    callSid: string,
    supervisorPhone: string,
  ): Promise<{ conferenceName: string; supervisorCallSid: string }> {
    if (!callSid?.trim()) {
      throw new Error('callSid is required.');
    }
    const to = supervisorPhone?.trim();
    if (!to) {
      throw new Error('supervisorPhone is required.');
    }
    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not set.');
    }
    if (!backendBaseUrl?.trim()) {
      throw new Error('BACKEND_URL environment variable is not set.');
    }

    const base = backendBaseUrl.replace(/\/+$/, '');
    const conferenceName = this.conferenceNameForCall(callSid);
    const joinUrl = (role: 'verification' | 'supervisor') =>
      `${base}/twilio/conference-join?room=${encodeURIComponent(conferenceName)}&role=${role}`;

    const statusCallback = `${base}/twilio/barge-supervisor-status?verificationCallSid=${encodeURIComponent(callSid.trim())}`;

    const supervisorCall = await client.calls.create({
      to,
      from: fromNumber,
      url: joinUrl('supervisor'),
      method: 'GET',
      statusCallback,
      statusCallbackEvent: ['answered', 'completed'],
      statusCallbackMethod: 'POST',
    });

    this.logger.log(
      `Supervisor barge dial started verificationCallSid=${callSid} supervisorCallSid=${supervisorCall.sid} conference=${conferenceName}`,
    );

    return {
      conferenceName,
      supervisorCallSid: supervisorCall.sid,
    };
  }

  /** Move the live TPA/verification leg into the barge conference (after supervisor answers). */
  async bridgeVerificationCallToConference(
    verificationCallSid: string,
  ): Promise<void> {
    const sid = verificationCallSid?.trim();
    if (!sid) return;
    if (this.verificationCallsBridgedToConference.has(sid)) {
      return;
    }
    if (!backendBaseUrl?.trim()) {
      throw new Error('BACKEND_URL environment variable is not set.');
    }

    const base = backendBaseUrl.replace(/\/+$/, '');
    const conferenceName = this.conferenceNameForCall(sid);
    const joinUrl = `${base}/twilio/conference-join?room=${encodeURIComponent(conferenceName)}&role=verification`;

    this.verificationCallsBridgedToConference.add(sid);
    await client.calls(sid).update({
      url: joinUrl,
      method: 'GET',
    });
    this.logger.log(
      `Bridged verification call ${sid} into conference ${conferenceName}`,
    );
  }

  /**
   * Make outbound call using Twilio telephony infrastructure.
   * Stores payeeId (and optional appointmentId) by call SID for the media stream when the WS URL omits query params.
   */
  async makeCall(
    to: string,
    PatientID: string,
    AgentId: string,
    AppointmentID?: string | null,
    options?: { navigateTpaIvr?: boolean },
  ) {
    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not set.');
    }

    const apptId = AppointmentID?.trim();
    const apptQ = apptId ? `&appointmentId=${encodeURIComponent(apptId)}` : '';
    const modeQ = options?.navigateTpaIvr === true ? '&mode=tpa-ivr' : '';
    this.logger.log(
      `Status Callback URL: ${backendBaseUrl}/appointments/status-callback`,
    );
    const call = await client.calls.create({
      to,
      from: fromNumber,
      url: `${backendBaseUrl}/twilio/inbound-stream?patientId=${encodeURIComponent(PatientID)}${apptQ}${modeQ}`,
      record: true,
      statusCallback: `${backendBaseUrl}/appointments/status-callback`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed'],
    });

    if (call?.sid && PatientID) {
      callSidToStreamContext.set(call.sid, {
        PatientID,
        AppointmentID: apptId || null,
        AgentId: AgentId, // Store agent ID if provided
      });
    }
    this.logger.log(`Stored context: CallSid=${call.sid}, AgentId=${AgentId}`);
    return call;
  }

  /**
   * STEP 3: Handle recording from Twilio
   * Downloads recording and forwards to verification API
   */
  async handleRecording(recordingUrl: string, PatientID: string) {
    try {
      const localPath = await this.downloadRecording(recordingUrl);

      const form = new FormData();
      form.append('file', fs.createReadStream(localPath));

      await axios.post(
        `${backendBaseUrl}/verifications/from-audio/${PatientID}`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiToken}`,
          },
        },
      );

      // Delete local copy after upload
      fs.unlinkSync(localPath);
    } catch (err) {
      console.error('Error handling recording:', err);
      throw new HttpException('Failed to handle recording', 500);
    }
  }

  /**
   * STEP 4: Download recording from Twilio
   */
  private async downloadRecording(url: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'calls');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const fileName = `${uuidv4()}.wav`;
    const filePath = path.join(uploadDir, fileName);

    const writer = fs.createWriteStream(filePath);
    const agent = new https.Agent({ rejectUnauthorized: false });

    const response = await axios({
      url: `${url}.wav`,
      method: 'GET',
      responseType: 'stream',
      httpsAgent: agent,
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
    });

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  }
}
