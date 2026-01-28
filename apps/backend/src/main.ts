import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MediaStreamHandlerService } from './twilio/media-stream.handler';
import * as WebSocket from 'ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  const port = process.env.PORT ?? 3000;
  const server = await app.listen(port);

  const wss = new WebSocket.Server({ server, path: '/twilio/media-stream' });
  const mediaHandler = app.get(MediaStreamHandlerService);
  wss.on('connection', (ws: WebSocket, req: { url?: string }) => {
    const url = new URL(req.url || '', 'http://localhost');
    const payeeId = url.searchParams.get('payeeId');
    mediaHandler.handleConnection(ws, payeeId);
  });
}
bootstrap();
