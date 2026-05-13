import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * OpenAPI (Swagger) UI at `/api` — interactive "Try it out" for all HTTP routes.
 *
 * **Authentication**
 * - **JWT** (`jwt-auth`): Obtain via `POST /auth/login`. Click **Authorize**, choose **jwt-auth**, paste `Bearer <access_token>`.
 * - **Verifications API token** (`verifications-api-token`): Static bearer token from env `VERIFICATIONS_API_TOKEN`. Used for server-to-server calls (Twilio webhooks, verification endpoints).
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('CovrAi Backend API')
    .setDescription(
      [
        'REST API for **CovrAi** — patient payees, insurance verifications, appointments, Twilio voice, and AI helpers.',
        '',
        '### Conventions',
        '- Base URL: same host as this page (e.g. `http://localhost:3000`).',
        '- JSON bodies use `Content-Type: application/json` unless noted.',
        '- **WebSocket** (not in Swagger): `GET ws://host/twilio/media-stream?patientId=<id>` (legacy `payeeId` also accepted) for EVA media stream.',
        '',
        '### Auth schemes',
        '1. **jwt-auth** — User login; required for `/payees`, `/appointments`, `/payers`, `/verifications` (GET), `/transcription`.',
        '2. **verifications-api-token** — Bearer token from `VERIFICATIONS_API_TOKEN`; required for `POST /verifications/*` (simulate, push-extracted, from-audio, from-extracted-call).',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT access token from `POST /auth/login` (response `access_token`).',
      },
      'jwt-auth',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'string',
        description:
          'Static API token: set env `VERIFICATIONS_API_TOKEN` and send `Authorization: Bearer <that value>`.',
      },
      'verifications-api-token',
    )
    .addTag('auth', 'Register and login (JWT)')
    .addTag('payees', 'Patient payee CRUD (JWT)')
    .addTag('verifications', 'Insurance verification — transcript, audio, extracted data (API token or JWT for reads)')
    .addTag('verification-requirements', 'Which benefit fields to collect per payee (order, optional custom question)')
    .addTag('appointments', 'Appointments (JWT)')
    .addTag('payers', 'Insurance payers — ADMIN create (JWT + role)')
    .addTag('providers', 'Healthcare providers')
    .addTag('offices', 'Offices / locations')
    .addTag('twilio', 'Twilio webhooks & outbound calls (TwiML + JSON)')
    .addTag('ai', 'Proxy to external RAG/AI server')
    .addTag('transcription', 'Audio upload → transcript + extraction (JWT)')
    .addTag('audio', 'Static audio file serving')
    .addTag('app', 'Health / root')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      methodKey,
  });

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'CovrAi API Docs',
  });
}
