import {
  Controller,
  Post,
  Query,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { TwilioService } from './twilio.service';
import { ElevenLabsService } from '../voice/elevenlabs.service';

const backendBaseUrl = process.env.BACKEND_URL;

/**
 * TwilioController handles phone call infrastructure via Twilio
 * All voice generation is handled by ElevenLabsService (not Twilio's voice)
 */
@Controller('twilio')
export class TwilioController {
  constructor(
    private readonly twilioService: TwilioService,
    private readonly elevenLabsService: ElevenLabsService,
  ) {}

  // STEP 1: Initiate outbound call
  @Post('call')
  async initiateCall(@Body() body: { to: string; payeeId: string }) {
    return this.twilioService.makeCall(body.to, body.payeeId);
  }

  // STEP 2: Main IVR step handler
  @Post('step')
  async handleStep(
    @Body() body: any,
    @Query('step') step: string,
    @Query('payeeId') payeeId: string,
    @Res() res: Response,
  ) {
    if (!payeeId) {
      const errorAudio = await this.elevenLabsService.synthesize(
        'Sorry, there was an error processing this call.',
      );

      res.type('text/xml').send(`
        <Response>
          <Play>${errorAudio}</Play>
          <Hangup/>
        </Response>
      `);
      return;
    }

    try {
      const recordingUrl = body?.RecordingUrl;

      // Handle previous step recording
      if (recordingUrl) {
        await this.twilioService.handleRecording(recordingUrl, payeeId);
      }

      const currentStep = parseInt(step || '0', 10);

      // End of steps
      if (currentStep >= this.twilioService.steps.length) {
        const goodbyeAudio = await this.elevenLabsService.synthesize(
          'Thank you for your time. Ending the call now. Goodbye.',
        );

        res.type('text/xml').send(`
          <Response>
            <Play>${goodbyeAudio}</Play>
            <Hangup/>
          </Response>
        `);
        return;
      }

      // Get step prompt text (your existing logic)
      const stepPrompt =
        this.twilioService.steps[currentStep] ??
        'Please respond after the beep.';

      const audioUrl = await this.elevenLabsService.synthesize(stepPrompt);

      res.type('text/xml').send(`
        <Response>
          <Play>${audioUrl}</Play>

          <Record
            timeout="5"
            maxLength="20"
            playBeep="true"
            action="${backendBaseUrl}/twilio/step?step=${currentStep + 1}&payeeId=${payeeId}"
            method="POST"
          />
        </Response>
      `);
    } catch (error) {
      const errorAudio = await this.elevenLabsService.synthesize(
        'Sorry, an unexpected error occurred. Please try again later.',
      );

      res.type('text/xml').send(`
        <Response>
          <Play>${errorAudio}</Play>
          <Hangup/>
        </Response>
      `);
    }
  }

  // STEP 3: Explicit recording webhook (optional, still supported)
  @Post('call-recording')
  async handleRecording(@Body() body: any, @Query('payeeId') payeeId: string) {
    const recordingUrl = body?.RecordingUrl;
    if (!recordingUrl) {
      throw new BadRequestException('Missing RecordingUrl from Twilio');
    }

    return this.twilioService.handleRecording(recordingUrl, payeeId);
  }

  // STEP 4: Ask "Is that all?" using ElevenLabs
  @Post('recording-done')
  async postRecordingConfirmation(
    @Body() body: any,
    @Query('payeeId') payeeId: string,
  ) {
    const recordingUrl = body?.RecordingUrl;
    if (!recordingUrl) {
      throw new BadRequestException('Missing RecordingUrl');
    }

    await this.twilioService.handleRecording(recordingUrl, payeeId);

    const questionAudio = await this.elevenLabsService.synthesize(
      'Is that all the information you would like to provide?',
    );

    return `
      <Response>
        <Play>${questionAudio}</Play>

        <Gather
          input="speech"
          timeout="5"
          action="${backendBaseUrl}/twilio/gather-response?payeeId=${payeeId}"
          method="POST"
        />
      </Response>
    `;
  }

  // STEP 5: Handle Gather response
  @Post('gather-response')
  async handleGather(@Body() body: any, @Query('payeeId') payeeId: string) {
    const speechResult = body?.SpeechResult?.toLowerCase() ?? '';

    if (speechResult.includes('yes')) {
      const byeAudio = await this.elevenLabsService.synthesize(
        'Thank you. Ending the call now. Goodbye.',
      );

      return `
        <Response>
          <Play>${byeAudio}</Play>
          <Hangup/>
        </Response>
      `;
    }

    const continueAudio = await this.elevenLabsService.synthesize(
      'Okay. Please provide the remaining details after the beep.',
    );

    return `
      <Response>
        <Play>${continueAudio}</Play>
        <Redirect method="POST">
          ${backendBaseUrl}/twilio/step?step=0&payeeId=${payeeId}
        </Redirect>
      </Response>
    `;
  }
}
