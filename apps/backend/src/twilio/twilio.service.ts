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

@Injectable()
export class TwilioService {
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
   * Make outbound call using Twilio telephony infrastructure
   * Note: All voice generation is handled by ElevenLabs via the webhook
   */
  async makeCall(to: string, payeeId: string) {
    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not set.');
    }

    return client.calls.create({
      to,
      from: fromNumber,
      url: `${backendBaseUrl}/twilio/step?step=0&payeeId=${payeeId}`,
      record: true,
    });
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
