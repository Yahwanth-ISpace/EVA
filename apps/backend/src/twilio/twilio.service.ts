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
const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
const apiToken = process.env.API_TOKEN ?? '';

const client = twilio(accountSid, authToken);

@Injectable()
export class TwilioService {
  // STEP 1: Make the actual call
  async makeCall(to: string, payeeId: string) {
    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not set.');
    }

    return client.calls.create({
      to,
      from: fromNumber,
      url: `${backendBaseUrl}/twilio/ivr-script?payeeId=${payeeId}`,
      record: true,
    });
  }

  // STEP 2: Generate TwiML that Twilio fetches
  generateTwiML(payeeId: string): string {
    return `
    <Response>
      <Say voice="alice">Hello. This is Springfield Clinic. We are verifying, insurance coverage, for your payee.</Say>
      <Pause length="2"/>
      <Say>Please provide insurance coverage details now.</Say>
      <Record
        maxLength="60"
        action="${backendBaseUrl}/twilio/recording-done?payeeId=${payeeId}"
        method="POST"
        playBeep="true"
      />
    </Response>
  `.trim();
  }

  // STEP 3: Called when recording is done — downloads and uploads to backend
  async handleCallRecording(recordingUrl: string, payeeId: string) {
    try {
      const localFilePath = await this.downloadRecording(recordingUrl);

      const form = new FormData();
      form.append('file', fs.createReadStream(localFilePath));

      console.log('Uploading file to verifications service:', localFilePath);

      const uploadResponse = await axios.post(
        `${backendBaseUrl}/verifications/from-audio/${payeeId}`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiToken}`,
          },
        },
      );

      fs.unlinkSync(localFilePath);

      console.log('Recording uploaded successfully:', uploadResponse.data);
      return {
        message: 'Recording uploaded successfully to verifications service',
        result: uploadResponse.data,
      };
    } catch (err) {
      console.error('Error uploading recording:', err);
      throw new HttpException('Failed to handle recording', 500);
    }
  }

  // STEP 4: Helper to download audio file from Twilio
  private async downloadRecording(recordingUrl: string): Promise<string> {
    const fileName = `${uuidv4()}.mp3`;
    const uploadDir = path.join(__dirname, '..', '..', 'uploads');
    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const writer = fs.createWriteStream(filePath);
    const agent = new https.Agent({ rejectUnauthorized: false });
    const mediaUrl = recordingUrl;
    console.log('Downloading recording from:', mediaUrl);

    const response = await axios({
      url: mediaUrl,
      method: 'GET',
      responseType: 'stream',
      httpsAgent: agent,
      headers: {
        Authorization: authHeader,
      },
    });

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve(filePath));
      writer.on('error', (err) => {
        console.error('Error writing recording file:', err);
        reject(err);
      });
    });
  }
}
