import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { MediaStreamHandlerService } from './twilio/media-stream.handler';
import { isFfmpegAvailable } from './voice/ffmpeg-check';
import { setupSwagger } from './swagger/swagger.setup';
import { assertProductionConfig } from './config/assert-production-config';
import {
  streamAuthEnforced,
  verifyStreamToken,
  type StreamClaims,
} from './twilio/stream-auth';
import { csrfMiddleware } from './auth/csrf.middleware';
import * as WebSocket from 'ws';

function corsOrigin():
  | string[]
  | ((
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void) {
  const fromEnv = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (fromEnv?.length) return fromEnv;

  // Local Vite (and similar) may use any port; reflect origin so preflight + credentials work.
  if (process.env.NODE_ENV !== 'production') {
    return (origin, callback) => {
      if (!origin) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    };
  }

  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

const API_CSP = {
  defaultSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
};

const SWAGGER_CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'https://validator.swagger.io'],
  fontSrc: ["'self'", 'data:'],
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
};

const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';
const FEATURE_POLICY = "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'";

function securityHeaders(directives: Record<string, string[]>): Parameters<typeof helmet>[0] {
  return {
    contentSecurityPolicy: { useDefaults: false, directives },
    frameguard: { action: 'deny' },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    xXssProtection: false,
  };
}

const MEDIA_STREAM_MAX_CONNECTIONS = Number(
  process.env.MEDIA_STREAM_MAX_CONNECTIONS || 50,
);
const MEDIA_STREAM_MAX_PER_IP = Number(process.env.MEDIA_STREAM_MAX_PER_IP || 8);

type UpgradeRequest = {
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

function headerValue(req: UpgradeRequest, name: string): string {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}

/** Query string is often stripped on the upgrade. Azure keeps the original URL in a header. */
function streamRequestUrl(req: UpgradeRequest): URL {
  const direct = new URL(req.url || '/', 'http://localhost');
  if (direct.search) return direct;
  const original =
    headerValue(req, 'x-original-url') || headerValue(req, 'x-original-uri');
  if (!original) return direct;
  try {
    const recovered = /^https?:\/\//i.test(original)
      ? new URL(original)
      : new URL(original, 'http://localhost');
    if (recovered.search) {
      console.log(
        `[MediaStream] recovered stream query from forwarding header path=${recovered.pathname} token=${recovered.searchParams.has('token') ? 'present' : 'missing'}`,
      );
      return recovered;
    }
  } catch {
    // Malformed forwarding header. Fall back to the upgrade path.
  }
  return direct;
}

function frameText(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return null;
}

/**
 * The upgrade URL lost its query string. Twilio still sends the signed token in
 * the first `start` message when TwiML included `<Parameter name="token">`.
 * Frames received before the handler is attached are replayed so `start` is not lost.
 */
function acceptStreamFromStart(
  ws: WebSocket,
  mediaHandler: MediaStreamHandlerService,
): void {
  const buffered: Array<Buffer | string> = [];
  let timer: NodeJS.Timeout;
  const onMessage = (data: Buffer | string) => {
    buffered.push(data);
    const text = frameText(data);
    if (!text) return;
    let msg: { event?: string; start?: { customParameters?: Record<string, string> } };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg?.event !== 'start') return;
    clearTimeout(timer);
    ws.off('message', onMessage);
    const params = msg.start?.customParameters ?? {};
    const startToken = typeof params.token === 'string' ? params.token : '';
    const claims: StreamClaims | null = verifyStreamToken(startToken);
    if (!claims) {
      console.error(
        `[MediaStream] closing websocket 1008 unauthorized reason=start-token-${startToken ? 'invalid' : 'missing'}`,
      );
      ws.close(1008, 'unauthorized');
      return;
    }
    console.log(
      `[MediaStream] websocket authorized from start parameters patientId=${claims.patientId} appointmentId=${claims.appointmentId ?? 'none'} mode=${claims.mode ?? 'eva'}`,
    );
    mediaHandler.handleConnection(
      ws,
      claims.patientId,
      claims.mode ?? null,
      claims.appointmentId ?? null,
    );
    for (const frame of buffered) ws.emit('message', frame);
  };
  timer = setTimeout(() => {
    ws.off('message', onMessage);
    console.error(
      '[MediaStream] closing websocket 1008 unauthorized reason=start-token-timeout',
    );
    ws.close(1008, 'unauthorized');
  }, 10_000);
  ws.on('close', () => clearTimeout(timer));
  ws.on('message', onMessage);
}

async function bootstrap() {
  assertProductionConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfMiddleware);
  const isProduction = process.env.NODE_ENV === 'production';
  const swaggerHelmet = helmet(securityHeaders(SWAGGER_CSP));
  const apiHelmet = helmet(securityHeaders(API_CSP));
  app.use((req, res, next) => {
    const path = req.path || '/';
    const swaggerDocs =
      isProduction &&
      (path === '/api' ||
        path.startsWith('/api/') ||
        path === '/api-json' ||
        path === '/api-yaml');
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    res.setHeader('Feature-Policy', FEATURE_POLICY);
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (!swaggerDocs && !path.startsWith('/audio')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    return (swaggerDocs ? swaggerHelmet : apiHelmet)(req, res, next);
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const http = app.getHttpAdapter().getInstance();
  http.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  if (isProduction) {
    setupSwagger(app);
  }
  app.enableCors({
    origin: corsOrigin(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-CSRF-Token',
      ...(process.env.NODE_ENV === 'production' ? [] : ['ngrok-skip-browser-warning']),
    ],
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = await app.listen(port, host);
  console.log(`[EVA] Backend http://127.0.0.1:${port}`);

  if (!isFfmpegAvailable()) {
    console.warn(
      '[EVA] ffmpeg not found. Media stream (TTS + transcription) will fail until ffmpeg is installed and on PATH. ' +
        'Install: https://ffmpeg.org/download.html (Windows: choco install ffmpeg; macOS: brew install ffmpeg; Linux: apt install ffmpeg).',
    );
  }

  // Twilio's stream URL is `${BACKEND_URL}/twilio/media-stream`. When BACKEND_URL
  // includes an `/api` prefix, the upgrade path is `/api/twilio/media-stream`.
  // `ws` rejects any other path with HTTP 400, which Twilio reports as 31920.
  const mediaStreamPaths = new Set([
    '/twilio/media-stream',
    '/api/twilio/media-stream',
  ]);
  const wss = new WebSocket.Server({
    noServer: true,
    maxPayload: 1_000_000,
  });
  server.on('upgrade', (req, socket, head) => {
    const rawUrl = req.url || '/';
    const queryAt = rawUrl.indexOf('?');
    const pathname = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt);
    if (!mediaStreamPaths.has(pathname)) {
      console.warn(
        `[MediaStream] rejected upgrade path=${pathname} (Twilio reports this as 31920)`,
      );
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  const mediaHandler = app.get(MediaStreamHandlerService);
  let openConnections = 0;
  const perIp = new Map<string, number>();

  wss.on('connection', (ws: WebSocket, req: { url?: string; socket?: { remoteAddress?: string } }) => {
    const ip = req.socket?.remoteAddress || 'unknown';
    const ipCount = perIp.get(ip) ?? 0;
    if (openConnections >= MEDIA_STREAM_MAX_CONNECTIONS || ipCount >= MEDIA_STREAM_MAX_PER_IP) {
      console.warn(
        `[MediaStream] closing websocket 1013 capacity ip=${ip} open=${openConnections} ipCount=${ipCount}`,
      );
      ws.close(1013, 'capacity');
      return;
    }
    openConnections += 1;
    perIp.set(ip, ipCount + 1);
    const release = () => {
      openConnections = Math.max(0, openConnections - 1);
      const next = (perIp.get(ip) ?? 1) - 1;
      if (next <= 0) perIp.delete(ip);
      else perIp.set(ip, next);
    };
    ws.on('close', release);

    let idle: NodeJS.Timeout | undefined;
    const bumpIdle = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => ws.close(1000, 'idle'), 2 * 60 * 60 * 1000);
    };
    bumpIdle();
    ws.on('message', bumpIdle);
    ws.on('close', () => idle && clearTimeout(idle));

    const url = streamRequestUrl(req);
    const token = url.searchParams.get('token');
    const claims = verifyStreamToken(token);
    if (streamAuthEnforced()) {
      if (claims) {
        console.log(
          `[MediaStream] websocket authorized path=${url.pathname} patientId=${claims.patientId} appointmentId=${claims.appointmentId ?? 'none'} mode=${claims.mode ?? 'eva'}`,
        );
        mediaHandler.handleConnection(
          ws,
          claims.patientId,
          claims.mode ?? null,
          claims.appointmentId ?? null,
        );
        return;
      }
      if (token) {
        console.error(
          `[MediaStream] closing websocket 1008 unauthorized path=${url.pathname} token=invalid patientId=${url.searchParams.get('patientId') ?? url.searchParams.get('PatientID') ?? 'none'} appointmentId=${url.searchParams.get('appointmentId') ?? 'none'}`,
        );
        ws.close(1008, 'unauthorized');
        return;
      }
      console.warn(
        `[MediaStream] stream query missing on upgrade path=${url.pathname}; waiting for Twilio start parameters`,
      );
      acceptStreamFromStart(ws, mediaHandler);
      return;
    }

    const patientId =
      url.searchParams.get('PatientID')?.trim() ||
      url.searchParams.get('payeeId')?.trim() ||
      null;
    const mode = url.searchParams.get('mode');
    const appointmentId = url.searchParams.get('appointmentId');
    mediaHandler.handleConnection(ws, patientId, mode, appointmentId);
  });
}
bootstrap();
