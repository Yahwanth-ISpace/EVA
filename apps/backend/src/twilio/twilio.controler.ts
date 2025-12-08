import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Response } from 'express';
import { TwilioService } from './twilio.service';

const backendBaseUrl = process.env.BACKEND_URL;

@Controller('twilio')
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  // Step 1: Make a call
  @Post('call')
  async initiateCall(@Body() body: { to: string; payeeId: string }) {
    console.log('Initiating call to:', body.to, 'for payeeId:', body.payeeId);
    return this.twilioService.makeCall(body.to, body.payeeId);
  }

  // Step 2: Twilio fetches this TwiML when the call is answered
  // @Post('ivr-script')
  // startScript(@Query('payeeId') payeeId: string, @Res() res: Response) {
  //   const twiml = this.twilioService.getStepTwiml('1', payeeId);
  //   res.type('text/xml').send(twiml);
  // }

  // Helper step for the IVR Script
  // @Post('ivr-step')
  // async ivrStep(
  //   @Query('step') step: string,
  //   @Query('payeeId') payeeId: string,
  //   @Body() body,
  //   @Res() res: Response,
  // ) {
  //   const recordingUrl = body.RecordingUrl ? body.RecordingUrl + '.mp3' : null;

  //   if (recordingUrl) {
  //     await this.twilioService.handleCallRecording(recordingUrl, payeeId);
  //   }

  //   const twiml = this.twilioService.getStepTwiml(step, payeeId);

  //   res.type('text/xml').send(twiml);
  // }
  // @Get('ivr-script')
  // async startCall(
  //   @Query('payeeId') payeeId: string,
  //   @Query('step') step: string,
  //   @Res() res,
  // ) {
  //   const stepIndex = parseInt(step ?? '0', 10);

  //   const twiml = this.twilioService.generateStepTwiML(stepIndex, payeeId);
  //   res.type('text/xml').send(twiml);
  // }

  // Step handler - Twilio uses GET for initial call, POST for subsequent redirects
  @Get('step')
  @Post('step')
  async handleStep(
    @Body() body: any,
    @Query('step') step: string,
    @Query('payeeId') payeeId: string,
    @Res() res: Response,
  ) {
    console.log('=== Twilio Step Request ===');
    console.log('Step:', step);
    console.log('PayeeId:', payeeId);
    console.log('Has RecordingUrl:', !!body?.RecordingUrl);
    console.log('==========================');

    if (!payeeId) {
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Sorry, there was an error processing this call.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml').send(errorTwiml);
      return;
    }

    try {
      const recordingUrl = body?.RecordingUrl;

      // Handle recording if present (from previous step)
      if (recordingUrl) {
        console.log('Processing recording from previous step');
        try {
          await this.twilioService.handleRecording(recordingUrl, payeeId);
        } catch (err) {
          console.error('Error handling recording:', err);
          // Continue even if recording fails
        }
      }

      const currentStep = parseInt(step || '0', 10);

      // Check if we've reached the end
      if (currentStep >= this.twilioService.steps.length) {
        const endTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
        res.type('text/xml').send(endTwiml);
        return;
      }

      // Generate TwiML for current step
      const twiml = this.twilioService.generateTwiML(currentStep, payeeId);
      console.log('Generated TwiML for step:', currentStep);
      res.type('text/xml').send(twiml);
    } catch (error: any) {
      console.error('Error in handleStep:', error);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Sorry, an error occurred. Please try again later.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml').send(errorTwiml);
    }
  }


  // Step 3: Twilio hits this after recording is done
  @Post('call-recording')
  async handleRecording(@Body() body: any, @Query('payeeId') payeeId: string) {
    const recordingUrl = body.RecordingUrl + '.mp3';
    if (!recordingUrl) {
      throw new BadRequestException('Missing RecordingUrl from Twilio');
    }
    console.log('Recording URL:', recordingUrl, 'for payeeId:', payeeId);
    return this.twilioService.handleRecording(recordingUrl, payeeId);
  }

  // Step 4: Twilio hits this to confirm thats all the user has to say
  @Post('recording-done')
  async getPostRecordingTwiML(
    @Body() body: any,
    @Query('payeeId') payeeId: string,
  ): Promise<string> {
    const recordingUrl = body.RecordingUrl;
    const recordingUrlWithExt = recordingUrl + '.mp3';
    if (!recordingUrlWithExt) {
      throw new BadRequestException('Missing RecordingUrl from Twilio');
    }

    // Call the service method to handle the recording
    await this.twilioService.handleRecording(recordingUrlWithExt, payeeId);

    // Then respond with the TwiML to ask user "Is that all you have?"
    return `
    <Response>
      <Say>Is that all you have?</Say>
      <Gather input="speech" timeout="5" action="/twilio/gather-response?payeeId=${payeeId}" method="POST">
      </Gather>
      <Say>We didn't get your response. Goodbye!</Say>
      <Hangup/>
    </Response>
  `.trim();
  }

  // Step 5: Handle user response from Gather
  @Post('gather-response')
  handleGather(@Body() body: any, @Query('payeeId') payeeId: string): string {
    const speechResult = body.SpeechResult?.toLowerCase() ?? '';

    if (speechResult.includes('yes')) {
      return `
      <Response>
        <Say>Thank you. Ending the call now.</Say>
        <Hangup/>
      </Response>
    `.trim();
    }

    console.log('User response:', speechResult);

    // If user said "no" or something else
    return `
    <Response>
      <Say>Okay, please provide more details.</Say>
      <Redirect method="POST">${backendBaseUrl}/twilio/ivr-script?payeeId=${payeeId}</Redirect>
    </Response>
  `.trim();
  }
}
