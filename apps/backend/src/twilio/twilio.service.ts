import { HttpException, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as FormData from 'form-data';

const accountSid = (process.env.TWILIO_ACCOUNT_SID ?? '').trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN ?? '').trim();
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const backendBaseUrl = process.env.BACKEND_URL;
const apiToken = process.env.VERIFICATIONS_API_TOKEN?.trim();

const client = twilio(accountSid, authToken);

/** In-memory map: call SID → payeeId, so the media stream can resolve payeeId when the WebSocket URL omits query params (e.g. some Twilio flows). */
const callSidToPayeeId = new Map<string, string>();

@Injectable()
export class TwilioService {
  /**
   * Resolve payeeId for an outbound call from its Twilio call SID.
   * Used by the media stream when the stream URL does not include payeeId (e.g. query params not passed through).
   */
  getPayeeIdForCall(callSid: string | null): string | null {
    if (!callSid?.trim()) return null;
    const payeeId = callSidToPayeeId.get(callSid) ?? null;
    if (payeeId) callSidToPayeeId.delete(callSid); // one-time use
    return payeeId;
  }

  // STEP PROMPTS (text only; ElevenLabs will convert to speech)
  steps: string[] = [
    'Hi, how are you doing today?',
    'Sure, I am Jennifer from Went Dentals.',
    'Yes, the patient name is John Merick. Date of birth is March thirty-first, nineteen ninety-two.',
    'Sure, the tax ID is one seven zero one zero one.',
    'The address is eight sixteen West Main Street, Danville, Virginia, two four five four one.',
    'I would like the coverage details of the patient.',
    'Can you please provide the deductible amount?',
    'What is the copay?',
    'What is the validity of the insurance?',
    'Thank you. I am done here.',
  ];

  /**
   * Hang up an active call by SID (e.g. when EVA has collected all details).
   */
  async hangUp(callSid: string): Promise<void> {
    if (!callSid?.trim()) return;
    await client.calls(callSid).update({ status: 'completed' });
  }

  /**
   * Make outbound call using Twilio telephony infrastructure.
   * Stores payeeId by call SID so the media stream can load patient details even if the stream URL omits query params.
   */
  async makeCall(to: string, payeeId: string) {
    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not set.');
    }

    const call = await client.calls.create({
      to,
      from: fromNumber,
      url: `${backendBaseUrl}/twilio/inbound-stream?payeeId=${encodeURIComponent(payeeId)}`,
      record: true,
    });

    if (call?.sid && payeeId) {
      callSidToPayeeId.set(call.sid, payeeId);
    }
    return call;
  }

  /**
   * STEP 3: Handle recording from Twilio
   * Downloads recording and forwards to verification API
   */
  async handleRecording(recordingUrl: string, payeeId: string) {
    try {
      const localPath = await this.downloadRecording(recordingUrl);

      const form = new FormData();
      form.append('file', fs.createReadStream(localPath));

      await axios.post(
        `${backendBaseUrl}/verifications/from-audio/${payeeId}`,
        form,
        {
          headers: { ...form.getHeaders(), Authorization: `Bearer ${apiToken}` },
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
