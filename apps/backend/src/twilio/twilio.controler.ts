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
  @Get('ivr-script')
  async startCall(
    @Query('payeeId') payeeId: string,
    @Query('step') step: string,
    @Res() res,
  ) {
    const stepIndex = parseInt(step ?? '0', 10);

    const twiml = this.twilioService.generateStepTwiML(stepIndex, payeeId);
    res.type('text/xml').send(twiml);
  }

  @Post('step')
  async handleStep(
    @Req() req,
    @Res() res,
    @Query('step') step: string,
    @Query('payeeId') payeeId: string,
  ) {
    const recordingUrl = req.body?.RecordingUrl;

    if (recordingUrl) {
      await this.twilioService.handleRecording(recordingUrl, payeeId);
    }

    const next = parseInt(step, 10) + 1;

    // end of script
    if (next >= this.twilioService.steps.length) {
      return res.type('text/xml').send(`
        <Response>
          <Say voice="alice">Thank you. Goodbye.</Say>
          <Hangup/>
        </Response>
      `);
    }

    const twiml = this.twilioService.generateStepTwiML(next, payeeId);
    res.type('text/xml').send(twiml);
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
