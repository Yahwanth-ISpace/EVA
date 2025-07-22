import { Controller, Get, Post, Query, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { TwilioService } from './twilio.service';

@Controller('twilio')
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  // Step 1: Make a call
  @Post('call')
  async initiateCall(@Body() body: { to: string; payeeId: string }) {
    return this.twilioService.makeCall(body.to, body.payeeId);
  }

  // Step 2: Twilio fetches this TwiML when the call is answered
  @Get('ivr-script')
  getTwiML(@Query('payeeId') payeeId: string, @Res() res: Response) {
    if (!payeeId) {
      return res.status(400).type('text/plain').send('Missing payeeId');
    }

    try {
      const twiml = this.twilioService.generateTwiML(payeeId);
      res.set('Content-Type', 'text/xml').status(200).send(twiml);
    } catch (error) {
      console.error('Error generating TwiML:', error);
      res.status(500).type('text/plain').send('Failed to generate TwiML');
    }
  }

  // Step 3: Twilio hits this after recording is done
  @Post('call-recording')
  async handleRecording(
    @Query('RecordingUrl') recordingUrl: string,
    @Query('payeeId') payeeId: string,
  ) {
    return this.twilioService.handleCallRecording(recordingUrl, payeeId);
  }
}
