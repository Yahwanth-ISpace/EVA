import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';
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
  @Post('ivr-script')
  handleIVRScript(@Query('payeeId') payeeId: string, @Res() res: Response) {
    const twiml = this.twilioService.generateTwiML(payeeId);
    res.type('text/xml').send(twiml);
  }

  // Step 3: Twilio hits this after recording is done
  @Post('call-recording')
  async handleRecording(@Body() body: any, @Query('payeeId') payeeId: string) {
    const recordingUrl = body.RecordingUrl;
    if (!recordingUrl) {
      throw new BadRequestException('Missing RecordingUrl from Twilio');
    }

    return this.twilioService.handleCallRecording(recordingUrl, payeeId);
  }
}
