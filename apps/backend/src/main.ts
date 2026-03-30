import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MediaStreamHandlerService } from './twilio/media-stream.handler';
import { isFfmpegAvailable } from './voice/ffmpeg-check';
import { setupSwagger } from './swagger/swagger.setup';
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupSwagger(app);
  app.enableCors({
    origin: corsOrigin(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'ngrok-skip-browser-warning',
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

  const wss = new WebSocket.Server({ server, path: '/twilio/media-stream' });
  const mediaHandler = app.get(MediaStreamHandlerService);
  wss.on('connection', (ws: WebSocket, req: { url?: string }) => {
    const url = new URL(req.url || '', 'http://localhost');
    const payeeId = url.searchParams.get('payeeId');
    mediaHandler.handleConnection(ws, payeeId);
  });
}
bootstrap();
