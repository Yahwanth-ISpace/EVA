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
const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

const client = twilio(accountSid, authToken);

@Injectable()
export class TwilioService {
  steps = [
    'Hi how are you doing today?',
    'I am Jenifer from Went Dentals.',
    'The patient name is John Merick. Date of birth is March 31st 1992.',
    'The Tax ID is 170102.',
    'The address is 816 West Main Street, Danville, Virginia, 24541.',
    'Can I get the coverage details of the patient?',
    'Can you provide the deductible amount?',
    'What is the copay?',
    'What is the validity of the insurance?',
    'Thank you. I am good.',
  ];

  // STEP 1: Make the actual call
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

  // generateTwiML(payeeId: string): string {
  //   return `
  //   <Response>
  //     <Say voice="alice">Hello. This is Springfield Clinic. We are verifying, insurance coverage, for your patient.</Say>
  //     <Pause length="0.5"/>
  //     <Say>Please provide insurance coverage details now.</Say>
  //     <Record
  //       maxLength="60"
  //       action="${backendBaseUrl}/twilio/recording-done?payeeId=${payeeId}"
  //       method="POST"
  //       playBeep="true"
  //     />
  //   </Response>
  // `.trim();

  // STEP 2: Generate TwiML that Twilio fetches
  // getStepTwiml(step: string, payeeId: string) {
  //   const next = (n: number) =>
  //     `${backendBaseUrl}/twilio/ivr-step?step=${n}&payeeId=${payeeId}`;

  //   const steps: Record<string, string> = {
  //     '1': `
  //     <Response>
  //       <Say>Hi, how are you doing today?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(2)}" method="POST"/>
  //     </Response>
  //   `,

  //     '2': `
  //     <Response>
  //       <Say>I am Jennifer, from Went Dentals.</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(3)}" method="POST"/>
  //     </Response>
  //   `,

  //     '3': `
  //     <Response>
  //       <Say>Can you provide the patient details?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(4)}" method="POST"/>
  //     </Response>
  //   `,

  //     '4': `
  //     <Response>
  //       <Say>The patient name is John Merick. The date of birth is March thirty first nineteen ninety two. May I know the Tax ID?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(5)}" method="POST"/>
  //     </Response>
  //   `,

  //     '5': `
  //     <Response>
  //       <Say>The Tax ID is one seven zero one zero two. Could you provide the address details?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(6)}" method="POST"/>
  //     </Response>
  //   `,

  //     '6': `
  //     <Response>
  //       <Say>The address is eight sixteen West Main Street, Danville Virginia two four five four one. What do you want to know about the patient?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(7)}" method="POST"/>
  //     </Response>
  //   `,

  //     '7': `
  //     <Response>
  //       <Say>Can I get the coverage details of the patient?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(8)}" method="POST"/>
  //     </Response>
  //   `,

  //     '8': `
  //     <Response>
  //       <Say>Can you provide the deductible amount?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(9)}" method="POST"/>
  //     </Response>
  //   `,

  //     '9': `
  //     <Response>
  //       <Say>What is the copay?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(10)}" method="POST"/>
  //     </Response>
  //   `,

  //     '10': `
  //     <Response>
  //       <Say>What is the validity of the insurance?</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(11)}" method="POST"/>
  //     </Response>
  //   `,

  //     '11': `
  //     <Response>
  //       <Say>Thank you, I am good.</Say>
  //       <Record playBeep="true" maxLength="30" action="${next(12)}" method="POST"/>
  //     </Response>
  //   `,

  //     '12': `
  //     <Response>
  //       <Say>Thank you. Goodbye.</Say>
  //       <Hangup/>
  //     </Response>
  //   `,
  //   };

  //   return steps[step] ?? steps['12'];
  // }

   generateTwiML(stepIndex: number,payeeId: string) {
    return `
    <Response>
      <Say voice="alice">${this.steps[stepIndex]}</Say>
      <Record
        maxLength="30"
        action="${backendBaseUrl}/twilio/step?step=${stepIndex}&payeeId=${payeeId}"
        method="POST"
      />
    </Response>
  `.trim();
  }

  // STEP 3: Called when recording is done — downloads and uploads to backend
  // async handleCallRecording(recordingUrl: string, payeeId: string) {
  //   try {
  //     const localFilePath = await this.downloadRecording(recordingUrl);

  //     const form = new FormData();
  //     form.append('file', fs.createReadStream(localFilePath));

  //     console.log('Uploading file to verifications service:', localFilePath);

  //     const uploadResponse = await axios.post(
  //       `${backendBaseUrl}/verifications/from-audio/${payeeId}`,
  //       form,
  //       {
  //         headers: {
  //           ...form.getHeaders(),
  //           Authorization: `Bearer ${apiToken}`,
  //         },
  //       },
  //     );

  //     fs.unlinkSync(localFilePath);

  //     console.log('Recording uploaded successfully:', uploadResponse.data);
  //     return {
  //       message: 'Recording uploaded successfully to verifications service',
  //       result: uploadResponse.data,
  //     };
  //   } catch (err) {
  //     console.error('Error uploading recording:', err);
  //     throw new HttpException('Failed to handle recording', 500);
  //   }
  // }

  async handleRecording(recordingUrl: string, payeeId: string) {
    const localPath = await this.downloadRecording(recordingUrl);

    const form = new FormData();
    form.append('file', fs.createReadStream(localPath));

    await axios.post(
      `${process.env.BACKEND_URL}/verifications/from-audio/${payeeId}`,
      form,
      { headers: form.getHeaders() },
    );

    fs.unlinkSync(localPath);
  }

  // STEP 4: Helper to download audio file from Twilio
  // private async downloadRecording(recordingUrl: string): Promise<string> {
  //   const fileName = `${uuidv4()}.mp3`;
  //   const uploadDir = path.join(__dirname, '..', '..', 'uploads');
  //   const filePath = path.join(uploadDir, fileName);

  //   if (!fs.existsSync(uploadDir)) {
  //     fs.mkdirSync(uploadDir, { recursive: true });
  //   }

  //   const writer = fs.createWriteStream(filePath);
  //   const agent = new https.Agent({ rejectUnauthorized: false });
  //   const mediaUrl = recordingUrl;
  //   console.log('Downloading recording from:', mediaUrl);

  //   const response = await axios({
  //     url: mediaUrl,
  //     method: 'GET',
  //     responseType: 'stream',
  //     httpsAgent: agent,
  //     headers: {
  //       Authorization: authHeader,
  //     },
  //   });

  //   return new Promise((resolve, reject) => {
  //     response.data.pipe(writer);
  //     writer.on('finish', () => resolve(filePath));
  //     writer.on('error', (err) => {
  //       console.error('Error writing recording file:', err);
  //       reject(err);
  //     });
  //   });
  // }

  private async downloadRecording(url: string): Promise<string> {
    const uploadDir = path.join(__dirname, '..', '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

    const fileName = `${uuidv4()}.mp3`;
    const filePath = path.join(uploadDir, fileName);

    const writer = fs.createWriteStream(filePath);
    const agent = new https.Agent({ rejectUnauthorized: false });

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      httpsAgent: agent,
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      },
    });

    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  }
}
