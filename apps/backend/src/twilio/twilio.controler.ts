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
import { ElevenLabsService } from '../voice/elevenlabs.service';

const backendBaseUrl = (process.env.BACKEND_URL || '').trim() || `http://localhost:${process.env.PORT ?? 3000}`;

/**
 * TwilioController handles phone call infrastructure via Twilio.
 * IVR: Press 1 complaints, 2 register insurance, 3 latest offers, 4 talk to agent (hold 10s then dial).
 */
@Controller('twilio')
export class TwilioController {
  constructor(
    private readonly twilioService: TwilioService,
    private readonly elevenLabsService: ElevenLabsService,
  ) {}

  /**
   * IVR inbound — when a call comes in, play menu and gather 1–4.
   * Configure Twilio phone number webhook: POST {{BACKEND_URL}}/twilio/inbound
   * Flow: 1 = complaint, 2 = register insurance, 3 = latest offers, 4 = hold 10s then dial agent (e.g. 9515663123).
   */
  @Post('inbound')
  async handleInbound(@Body() body: Record<string, string>, @Res() res: Response) {
    res.type('text/xml').send(`
      <Response>
        <Gather numDigits="1" action="${backendBaseUrl}/twilio/ivr-menu" method="POST" timeout="5">
          <Say voice="alice">Thank you for calling. Press 1 regarding complaint. Press 2 to register insurance. Press 3 to fetch latest insurance offers. Press 4 to talk to our customer agent.</Say>
        </Gather>
        <Say voice="alice">We didn't receive any input. Goodbye.</Say>
        <Hangup/>
      </Response>
    `);
  }

  /**
   * IVR menu handler — branch on digit (1–4). Option 4: hold 10 seconds then dial agent number.
   */
  @Post('ivr-menu')
  async handleIvrMenu(@Body() body: Record<string, string>, @Res() res: Response) {
    const digits = (body?.Digits || body?.digits || '').trim();
    const base = backendBaseUrl;

    switch (digits) {
      case '1': {
        res.type('text/xml').send(`
          <Response>
            <Say voice="alice">You selected complaints. Our team will note your concern. You can also email us at support at went dentals dot com. Thank you for calling.</Say>
            <Hangup/>
          </Response>
        `);
        return;
      }
      case '2': {
        res.type('text/xml').send(`
          <Response>
            <Say voice="alice">You selected insurance registration. Please visit our website or call back during business hours to complete registration. Thank you for calling.</Say>
            <Hangup/>
          </Response>
        `);
        return;
      }
      case '3': {
        res.type('text/xml').send(`
          <Response>
            <Say voice="alice">You selected latest insurance offers. Current offers are available on our website. Thank you for calling.</Say>
            <Hangup/>
          </Response>
        `);
        return;
      }
      case '4': {
        // Agent number: env (IVR_AGENT_PHONE_NUMBER or TWILIO_AGENT_PHONE_NUMBER) or default +919515663123
        const agentNumber = (
          process.env.IVR_AGENT_PHONE_NUMBER ||
          process.env.TWILIO_AGENT_PHONE_NUMBER ||
          '+919515663123'
        ).trim();
        res.type('text/xml').send(`
          <Response>
            <Say voice="alice">Please hold while we connect you to our customer agent. This may take a few seconds.</Say>
            <Pause length="10"/>
            <Dial timeout="30" callerId="${process.env.TWILIO_PHONE_NUMBER || ''}">${agentNumber}</Dial>
            <Say voice="alice">The agent could not be reached. Please try again later. Goodbye.</Say>
            <Hangup/>
          </Response>
        `);
        return;
      }
      default: {
        res.type('text/xml').send(`
          <Response>
            <Say voice="alice">Invalid option. Please call back and press 1 for complaints, 2 for insurance registration, 3 for latest offers, or 4 to speak with an agent. Goodbye.</Say>
            <Hangup/>
          </Response>
        `);
        return;
      }
    }
  }

  /**
   * Inbound/outbound call with Media Stream: Twilio connects the call to our WebSocket.
   * We speak with ElevenLabs, stream user audio to Whisper, LLM extracts or handles
   * interruptions, update backend, respond with TTS. Accepts GET (outbound) and POST (inbound).
   */
  @Post('inbound-stream')
  async handleInboundStreamPost(
    @Body() body: Record<string, string>,
    @Query('payeeId') payeeIdQuery: string,
    @Res() res: Response,
  ) {
    const payeeId =
      payeeIdQuery ||
      process.env.INBOUND_PAYEE_ID?.trim() ||
      body?.payeeId ||
      'inbound';
    this.sendStreamTwiML(payeeId, res);
  }

  @Get('inbound-stream')
  async handleInboundStreamGet(@Query('payeeId') payeeId: string, @Res() res: Response) {
    const id = payeeId || process.env.INBOUND_PAYEE_ID?.trim() || 'inbound';
    this.sendStreamTwiML(id, res);
  }

  private sendStreamTwiML(payeeId: string, res: Response) {
    const base = (
      process.env.BACKEND_URL ||
      `http://localhost:${process.env.PORT ?? 3000}`
    ).trim();
    const streamUrl =
      base.replace(/^http/, 'ws') + '/twilio/media-stream?payeeId=' + encodeURIComponent(payeeId);

    res.type('text/xml').send(`
      <Response>
        <Connect>
          <Stream url="${streamUrl}" />
        </Connect>
      </Response>
    `);
  }

  /**
   * TwiML for outbound IVR-bypass call: connect the call to the media stream in ivr-bypass mode.
   * EVA's Twilio calls the IVR number with this as the initial URL; we return <Connect><Stream url="...?mode=ivr-bypass"/>.
   */
  @Get('outbound-ivr-connect')
  @Post('outbound-ivr-connect')
  outboundIvrConnect(@Res() res: Response) {
    const base = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT ?? 3000}`).trim();
    const streamUrl = base.replace(/^http/, 'ws') + '/twilio/media-stream?mode=ivr-bypass';
    res.type('text/xml').send(`
      <Response>
        <Connect>
          <Stream url="${streamUrl}" />
        </Connect>
      </Response>
    `);
  }

  /**
   * TwiML that sends DTMF 4 into the call (used when IVR bypass detects "customer agent").
   * Twilio redirects the call here; we return <Play digits="4"/> so the IVR receives 4 and runs option 4 (hold 10s, dial agent).
   */
  @Get('play-dtmf-4')
  @Post('play-dtmf-4')
  playDtmf4(@Res() res: Response) {
    res.type('text/xml').send(
      '<Response><Play digits="4"/></Response>',
    );
  }

  /**
   * Start outbound call from EVA's number to the IVR number; stream runs in ivr-bypass mode (STT listens for "customer agent", then sends 4).
   * Body optional: { "to": "+1..." } to override TWILIO_IVR_PHONE_NUMBER.
   */
  @Post('call-ivr-and-bypass')
  async callIvrAndBypass(@Body() body: { to?: string }) {
    return this.twilioService.callIvrAndBypass(body?.to);
  }

  /**
   * Call status callback — "Call status changes" (Twilio POST to /twilio/status).
   * Acknowledge with 200; optionally log CallSid, CallStatus, etc.
   */
  @Post('status')
  async handleStatusCallback(@Body() body: Record<string, string>) {
    const { CallSid, CallStatus } = body ?? {};
    if (CallSid && CallStatus) {
      // Optional: log or persist for analytics
      console.log(`[Twilio] Call ${CallSid} status: ${CallStatus}`);
    }
    return {};
  }

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
