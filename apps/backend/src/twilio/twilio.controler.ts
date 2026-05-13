import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';
import { Response } from 'express';
import { TwilioService } from './twilio.service';
import { ElevenLabsService } from '../voice/elevenlabs.service';
import {
  TwilioCallIvrDto,
  TwilioEndCallDto,
  TwilioInitiateCallDto,
  TwilioPutOnHoldDto,
} from './dto/twilio-call.dto';

const backendBaseUrl = (process.env.BACKEND_URL || '').trim() || `http://localhost:${process.env.PORT ?? 3000}`;

/**
 * Base URL for Twilio Media Stream WebSocket. Twilio requires wss:// in production (1011 invalid url for ws://).
 * - TWILIO_STREAM_BASE_URL: use as-is (e.g. wss://your-domain.com when behind SSL proxy).
 * - BACKEND_URL https -> wss, http -> ws (use HTTPS in production so stream URL is wss).
 */
function getStreamBaseUrl(): string {
  const base = (
    process.env.TWILIO_STREAM_BASE_URL ||
    process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT ?? 3000}`
  ).trim();
  if (base.startsWith('wss://') || base.startsWith('ws://')) return base.replace(/\/+$/, '');
  if (base.startsWith('https://')) return base.replace(/^https/, 'wss').replace(/\/+$/, '');
  return base.replace(/^http/, 'ws').replace(/\/+$/, '');
}

/** TwiML attributes are XML; `&` in query strings must be escaped or Twilio rejects the document ("we're sorry"). */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * TwilioController handles phone call infrastructure via Twilio.
 * IVR: Press 1 complaints, 2 register insurance, 3 latest offers, 4 talk to agent (hold 10s then dial).
 */
@ApiTags('twilio')
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
  @ApiOperation({
    summary: 'IVR inbound — main menu (TwiML)',
    description:
      'Twilio webhook: plays menu (press 1–4). Configure your Twilio number **Voice webhook** to `POST /twilio/inbound`. Returns `text/xml`.',
  })
  @ApiProduces('text/xml')
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
  @ApiOperation({
    summary: 'IVR digit handler (TwiML)',
    description: 'Follow-up from Gather on `/twilio/inbound`; branches on Digits 1–4.',
  })
  @ApiProduces('text/xml')
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
  @ApiOperation({
    summary: 'Connect call to EVA media stream (TwiML)',
    description:
      'Returns `<Connect><Stream url="ws(s)://.../twilio/media-stream?patientId=...">`. Query `patientId` (preferred) or legacy `payeeId`, or `INBOUND_PAYEE_ID` env.',
  })
  @ApiQuery({
    name: 'patientId',
    required: false,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiQuery({ name: 'payeeId', required: false, example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiQuery({ name: 'appointmentId', required: false })
  @ApiQuery({
    name: 'mode',
    required: false,
    description: 'Set `tpa-ivr` to navigate payer phone menus before EVA speaks.',
  })
  @ApiProduces('text/xml')
  async handleInboundStreamPost(
    @Body() body: Record<string, string>,
    @Query('patientId') patientIdQuery: string,
    @Query('payeeId') payeeIdQuery: string,
    @Query('appointmentId') appointmentIdQuery: string,
    @Query('mode') modeQuery: string,
    @Res() res: Response,
  ) {
    const externalPatientId =
      patientIdQuery?.trim() ||
      payeeIdQuery?.trim() ||
      process.env.INBOUND_PAYEE_ID?.trim() ||
      body?.patientId?.trim() ||
      body?.payeeId?.trim() ||
      'inbound';
    const appointmentId =
      appointmentIdQuery?.trim() || body?.appointmentId?.trim() || undefined;
    const streamMode = modeQuery?.trim() || undefined;
    this.sendStreamTwiML(externalPatientId, res, appointmentId, streamMode);
  }

  @Get('inbound-stream')
  @ApiOperation({ summary: 'Same as POST inbound-stream (GET for some Twilio configs)' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'payeeId', required: false })
  @ApiQuery({ name: 'appointmentId', required: false })
  @ApiQuery({
    name: 'mode',
    required: false,
    description: 'Set `tpa-ivr` to navigate payer phone menus before EVA speaks.',
  })
  @ApiProduces('text/xml')
  async handleInboundStreamGet(
    @Query('patientId') patientId: string,
    @Query('payeeId') payeeId: string,
    @Query('appointmentId') appointmentId: string,
    @Query('mode') mode: string,
    @Res() res: Response,
  ) {
    const id =
      patientId?.trim() ||
      payeeId?.trim() ||
      process.env.INBOUND_PAYEE_ID?.trim() ||
      'inbound';
    const appt = appointmentId?.trim() || undefined;
    const streamMode = mode?.trim() || undefined;
    this.sendStreamTwiML(id, res, appt, streamMode);
  }

  private sendStreamTwiML(
    externalPatientId: string,
    res: Response,
    appointmentId?: string,
    streamMode?: string,
  ) {
    const apptQ = appointmentId?.trim()
      ? '&appointmentId=' + encodeURIComponent(appointmentId.trim())
      : '';
    const modeQ =
      streamMode === 'tpa-ivr'
        ? '&mode=' + encodeURIComponent('tpa-ivr')
        : '';
    const streamUrl =
      getStreamBaseUrl() +
      '/twilio/media-stream?patientId=' +
      encodeURIComponent(externalPatientId) +
      apptQ +
      modeQ;

    res.type('text/xml').send(`
      <Response>
        <Connect>
          <Stream url="${escapeXmlAttr(streamUrl)}" />
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
  @ApiOperation({
    summary: 'IVR-bypass stream (TwiML)',
    description: 'Media stream with `mode=ivr-bypass` for STT-driven DTMF 4 flow.',
  })
  @ApiProduces('text/xml')
  outboundIvrConnect(@Res() res: Response) {
    const streamUrl = getStreamBaseUrl() + '/twilio/media-stream?mode=ivr-bypass';
    res.type('text/xml').send(`
      <Response>
        <Connect>
          <Stream url="${escapeXmlAttr(streamUrl)}" />
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
  @ApiOperation({ summary: 'Send DTMF digit 4 (TwiML)' })
  @ApiProduces('text/xml')
  playDtmf4(@Res() res: Response) {
    res.type('text/xml').send(
      '<Response><Play digits="4"/></Response>',
    );
  }

  /**
   * Play DTMF digits into an in-progress IVR-bypass call, then reconnect the media stream
   * in ivr-bypass mode so phase 1 can continue until a live agent is reached.
   * Query: `digits` (Twilio: 0-9, w/W pauses, # *), optional `patientId` or legacy `payeeId`, optional `appointmentId`.
   */
  @Get('ivr-bypass-dtmf')
  @Post('ivr-bypass-dtmf')
  @ApiOperation({
    summary: 'Send DTMF then reconnect IVR bypass stream',
    description:
      'Returns TwiML `<Play digits/><Connect><Stream...mode=ivr-bypass/></Connect>`.',
  })
  @ApiProduces('text/xml')
  ivrBypassDtmf(
    @Query('digits') digits: string,
    @Query('patientId') patientId: string,
    @Query('payeeId') payeeId: string,
    @Query('appointmentId') appointmentId: string,
    @Res() res: Response,
  ) {
    const raw = (digits || '').trim();
    if (!raw || !/^[\d#*wW]+$/.test(raw)) {
      throw new BadRequestException(
        'Query `digits` is required and must contain only 0-9, #, *, w, W.',
      );
    }
    const pid = (patientId || payeeId || '').trim();
    const q = new URLSearchParams({ mode: 'ivr-bypass' });
    if (pid) {
      q.set('patientId', pid);
      q.set('payeeId', pid);
    }
    if (appointmentId?.trim()) q.set('appointmentId', appointmentId.trim());
    const streamUrl = `${getStreamBaseUrl()}/twilio/media-stream?${q.toString()}`;

    res.type('text/xml').send(`
      <Response>
        <Play digits="${escapeXmlAttr(raw)}" />
        <Connect>
          <Stream url="${escapeXmlAttr(streamUrl)}" />
        </Connect>
      </Response>
    `);
  }

  /**
   * Play DTMF digits into an in-progress call, then reconnect the media stream for TPA IVR navigation.
   * Query: `digits` (Twilio: 0-9, w/W pauses, # *), `patientId` or legacy `payeeId`, optional `appointmentId`.
   */
  @Get('tpa-ivr-dtmf')
  @Post('tpa-ivr-dtmf')
  @ApiOperation({
    summary: 'Send DTMF then reconnect TPA IVR stream',
    description:
      'Returns TwiML `<Play digits/><Connect><Stream...mode=tpa-ivr/></Connect>`. Used after member ID or DOB prompts.',
  })
  @ApiProduces('text/xml')
  tpaIvrDtmf(
    @Query('digits') digits: string,
    @Query('patientId') patientId: string,
    @Query('payeeId') payeeId: string,
    @Query('appointmentId') appointmentId: string,
    @Res() res: Response,
  ) {
    const raw = (digits || '').trim();
    if (!raw || !/^[\d#*wW]+$/.test(raw)) {
      throw new BadRequestException(
        'Query `digits` is required and must contain only 0-9, #, *, w, W.',
      );
    }
    const pid = (patientId || payeeId || '').trim();
    if (!pid) {
      throw new BadRequestException(
        'Query `patientId` or `payeeId` is required.',
      );
    }
    const apptQ = appointmentId?.trim()
      ? '&appointmentId=' + encodeURIComponent(appointmentId.trim())
      : '';
    const streamUrl =
      getStreamBaseUrl() +
      '/twilio/media-stream?patientId=' +
      encodeURIComponent(pid) +
      apptQ +
      '&mode=tpa-ivr';

    res.type('text/xml').send(`
      <Response>
        <Play digits="${escapeXmlAttr(raw)}" />
        <Connect>
          <Stream url="${escapeXmlAttr(streamUrl)}" />
        </Connect>
      </Response>
    `);
  }

  /**
   * Start outbound call from EVA's number to the IVR number; stream runs in ivr-bypass mode (STT listens for "customer agent", then sends 4).
   * Body optional: { "to": "+1..." } to override TWILIO_IVR_PHONE_NUMBER.
   */
  @Post('call-ivr-and-bypass')
  @ApiOperation({
    summary: 'Start outbound call to IVR in bypass mode',
    description: 'JSON body optional `{ "to": "+1..." }`; defaults to `TWILIO_IVR_PHONE_NUMBER`.',
  })
  @ApiBody({ type: TwilioCallIvrDto })
  async callIvrAndBypass(@Body() body: TwilioCallIvrDto) {
    return this.twilioService.callIvrAndBypass(body?.to);
  }

  /**
   * Call status callback — "Call status changes" (Twilio POST to /twilio/status).
   * Acknowledge with 200; optionally log CallSid, CallStatus, etc.
   */
  @Post('status')
  @ApiOperation({
    summary: 'Twilio call status callback',
    description: 'Twilio posts `CallSid`, `CallStatus`, etc. Returns `{}`.',
  })
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
  @ApiOperation({
    summary: 'Outbound verification call',
    description:
      'Dials `to` with TwiML that connects media stream for `payeeId` (EVA benefit verification).',
  })
  @ApiBody({ type: TwilioInitiateCallDto })
  async initiateCall(@Body() body: TwilioInitiateCallDto) {
    return this.twilioService.makeCall(
      body.to,
      body.payeeId,
      body.appointmentId,
      { navigateTpaIvr: body.navigateTpaIvr === true },
    );
  }

  /**
   * TwiML for hold: brief message + looping music. Twilio fetches this URL when you `PUT`/`POST` redirect the call here.
   * Optional `TWILIO_HOLD_MUSIC_URL` (mp3/wav); defaults to Twilio sample classical clip.
   */
  @Get('hold-music')
  @Post('hold-music')
  @ApiOperation({
    summary: 'Hold music (TwiML)',
    description:
      'Returns `<Say>` + `<Play loop="0">` using `TWILIO_HOLD_MUSIC_URL` or a default URL. Used by `POST /twilio/put-on-hold`.',
  })
  @ApiProduces('text/xml')
  holdMusic(@Res() res: Response) {
    const moh = (
      process.env.TWILIO_HOLD_MUSIC_URL?.trim() ||
      'http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3'
    ).trim();
    res.type('text/xml').send(`
      <Response>
        <Say voice="alice">Please hold.</Say>
        <Play loop="0">${escapeXmlAttr(moh)}</Play>
      </Response>
    `);
  }

  @Post('put-on-hold')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'Put active Twilio call on hold',
    description:
      'Calls Twilio `POST /Calls/{CallSid}.json` with `Url` set to this server’s `/twilio/hold-music` (ends any in-progress `<Connect><Stream>` until you redirect the call elsewhere). Requires JWT.',
  })
  @ApiBody({ type: TwilioPutOnHoldDto })
  async putOnHold(@Body() body: TwilioPutOnHoldDto) {
    await this.twilioService.putCallOnHold(body.callSid);
    return { ok: true };
  }

  @Post('end-call')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'End active Twilio call',
    description:
      'Twilio REST: sets call `Status` to `completed` for the given Call SID (e.g. from live events). Requires JWT.',
  })
  @ApiBody({ type: TwilioEndCallDto })
  async endCall(@Body() body: TwilioEndCallDto) {
    await this.twilioService.hangUp(body.callSid);
    return { ok: true };
  }

  // STEP 2: Main IVR step handler
  @Post('step')
  @ApiOperation({
    summary: 'Legacy IVR step (TwiML)',
    description: 'Multi-step record flow with `step` and `payeeId` query params. Returns TwiML.',
  })
  @ApiQuery({ name: 'step', required: false, example: '0' })
  @ApiQuery({ name: 'payeeId', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiProduces('text/xml')
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
  @ApiOperation({ summary: 'Recording webhook', description: 'Twilio posts `RecordingUrl`; processes with `payeeId` query.' })
  @ApiQuery({ name: 'payeeId', required: true })
  async handleRecording(@Body() body: any, @Query('payeeId') payeeId: string) {
    const recordingUrl = body?.RecordingUrl;
    if (!recordingUrl) {
      throw new BadRequestException('Missing RecordingUrl from Twilio');
    }

    return this.twilioService.handleRecording(recordingUrl, payeeId);
  }

  // STEP 4: Ask "Is that all?" using ElevenLabs
  @Post('recording-done')
  @ApiOperation({ summary: 'Post-recording confirmation TwiML' })
  @ApiQuery({ name: 'payeeId', required: true })
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
  @ApiOperation({ summary: 'Speech gather result (yes/no branch)' })
  @ApiQuery({ name: 'payeeId', required: true })
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
