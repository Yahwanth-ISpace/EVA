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
import { streamAuthEnforced, verifyStreamToken } from './twilio/stream-auth';
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

const MEDIA_STREAM_MAX_CONNECTIONS = Number(
  process.env.MEDIA_STREAM_MAX_CONNECTIONS || 50,
);
const MEDIA_STREAM_MAX_PER_IP = Number(process.env.MEDIA_STREAM_MAX_PER_IP || 8);

async function bootstrap() {
  assertProductionConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const http = app.getHttpAdapter().getInstance();
  http.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  if (process.env.NODE_ENV !== 'production') {
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
  const port = process.env.PORT ?? 3000;
  const server = await app.listen(port);

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

    const url = new URL(req.url || '', 'http://localhost');
    const claims = verifyStreamToken(url.searchParams.get('token'));
    if (streamAuthEnforced()) {
      if (!claims) {
        ws.close(1008, 'unauthorized');
        return;
      }
      mediaHandler.handleConnection(
        ws,
        claims.patientId,
        claims.mode ?? null,
        claims.appointmentId ?? null,
      );
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
