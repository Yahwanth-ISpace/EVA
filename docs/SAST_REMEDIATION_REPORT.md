# EVA SAST remediation report

Report answered: **EVA-SAST-2026-10** (28 October 2026)  
Remediation date: 28 October 2026  
Scope: code and local deployment configuration in this repository

This report records what was changed for each finding, what you still need to do outside the code, and the items that were left because they would change a major part of how the application runs. Those items are listed at the end and need your acknowledgement before they are implemented.

## How to read the status column

| Status | Meaning |
| --- | --- |
| Fixed | The exploitable condition described in the finding is closed in code. |
| Fixed with follow-up | The code path is closed. You still need to rotate a secret, set an environment variable, or review existing data. |
| Partial | The change that is safe to ship is in place. The remaining piece would change a major workflow and is waiting on you. |

## Critical

### SAST-01 Self-service ADMIN registration — Fixed with follow-up

`POST /auth/register` no longer accepts `role`, name, date of birth, SSN, or payer. Every self-registered account is stored as `OPERATOR` with a blank profile, so a new account cannot match another patient's appointments by typing that patient's name.

Administrators are created only by an existing administrator:

- `POST /user` with role `ADMIN` or `OPERATOR`
- `PATCH /user/:id` to set legal name, date of birth, and role after identity is confirmed

The signup screen no longer offers an Admin option.

**Follow-up:** review the `User` collection for unexpected `ADMIN` accounts. If this environment has no administrator yet, create the first one directly in the database (email, bcrypt hash, `role: "ADMIN"`), then use `POST /user` after that.

### SAST-02 No default-deny authentication — Fixed

`JwtAuthGuard` and `RolesGuard` are registered as global guards. A route is anonymous only when it is marked `@Public()`.

Anonymous routes that remain:

- `GET /` health
- `POST /auth/login` and `POST /auth/register` (rate limited)
- `GET /audio/:filename` so Twilio can fetch generated audio (filename is restricted to a safe character set)
- Twilio webhooks, which are `@Public()` and also require a valid `X-Twilio-Signature`
- Verification write routes that already use `VERIFICATIONS_API_TOKEN` (`@Public()` plus `ApiTokenGuard`)

Previously open areas now require a logged-in user, and the sensitive actions require `ADMIN`:

- outbound `POST /twilio/call`
- `POST /appointments` (this is what starts a verification call)
- `POST /ai/ingest-text`
- payee create and update
- provider and office create
- verification-requirement create, update, and delete
- `GET /scheduler/sample-data` and `GET /scheduler/appointment` (also disabled in production unless `ENABLE_SCHEDULER_HTTP=true`)

The scheduled job itself still runs inside the process. Only the unauthenticated HTTP trigger was closed.

### SAST-03 Twilio credential theft via recording download — Fixed with follow-up

`downloadRecording` now:

- accepts only `https://api.twilio.com/...`
- refuses URLs that embed their own username or password
- follows no redirects (`maxRedirects: 0`)
- verifies TLS certificates (the `rejectUnauthorized: false` agent is gone)
- times out after 30 seconds and stops at 25 MB

The Twilio account SID and auth token are sent only after that host check.

**Follow-up:** treat the Twilio Auth Token as compromised if this endpoint was ever reachable from the internet, and rotate it. Rotate `VERIFICATIONS_API_TOKEN` as well (see SAST-09).

## High

### SAST-04 AI server authentication and tenant isolation — Fixed with follow-up

- RAG, transcription, and emotion classification require `Authorization: Bearer <AI_SERVICE_TOKEN>` when the token is set, and always when `AI_REQUIRE_AUTH=true` (the AI image and compose file set that).
- Ingest metadata can no longer overwrite `tenant_id`, `doc_id`, or `chunk_id`. Those fields are written after metadata.
- `POST /ai/ingest-text` is administrator-only.
- `POST /ai/ask` forces the payer id from the operator's linked payee. Administrators must send a payer id explicitly.
- The backend sends the service token on Whisper, emotion, and RAG calls.
- Compose publishes the AI server and MongoDB on `127.0.0.1` only, not on every network interface.
- Qdrant logs a warning when `QDRANT_API_KEY` is empty.

**Follow-up:** set the same `AI_SERVICE_TOKEN` in `apps/backend/.env` (the compose file loads that file into both containers). Direct browser access to the AI server is not supported; the dashboard must keep calling the Nest API.

### SAST-05 SSN and other personal data — Partial

Done:

- New and updated payee SSNs are stored with AES-256-GCM (`SSN_ENCRYPTION_KEY`, or a key derived from `JWT_SECRET` outside production).
- API responses, including login, return a masked SSN (`***-**-1234`) or nothing. Password hashes on a nested user are removed before a payee is returned.
- The JWT contains only `sub`, `email`, and `role`.
- The browser strips `ssn` before writing the user object to `localStorage`.
- Voice prompts receive at most the last four digits, and the instruction is fixed in code: the model is told to say only those four digits and never to invent a full number. Caller speech is labeled as untrusted data.

Not done, because it changes the Sabrina sync path: appointment documents copied from Sabrina can still contain a full SSN at rest. The API mapper already returns an empty SSN for those documents, and the voice path now uses only the last four. Encrypting that collection would be overwritten the next time Sabrina data is saved unless the sync itself is changed. That needs your acknowledgement (see below).

**Follow-up:** set `SSN_ENCRYPTION_KEY` to 32 bytes (base64 or 64 hex characters) in every real environment. Existing plaintext payee SSNs are masked on read and encrypted the next time that payee is updated.

### SAST-06 Broken object authorization — Partial

Done:

- Operators can list and open only payees whose `userId` is their own. Create and update are administrator-only.
- `GET /verifications/:id` checks the caller's allowed patient ids. Administrators can read any verification.
- Appointment reads for operators use the same rule.
- Public registration no longer stores a name or date of birth, so a new account cannot claim a patient by typing that patient's details.

Staff access no longer treats the signed-in person as the patient. Administrators and operators both see every appointment, verification, and payee so they can monitor live calls. Operators can delete appointments and verifications and can add, edit, or remove extracted fields after a call. Creating users, agents, payees, providers, offices, outbound calls, scheduler triggers, and knowledge-base ingest stay administrator-only.

### SAST-07 Twilio webhook signatures — Fixed with follow-up

Every Twilio webhook, including `POST /appointments/status-callback`, validates `X-Twilio-Signature` with `TWILIO_AUTH_TOKEN` against `BACKEND_URL` plus the request path and query string.

`TWILIO_SKIP_SIGNATURE=true` is ignored when `NODE_ENV=production`.

**Follow-up:** `BACKEND_URL` must be the exact public URL Twilio calls, including `https`. A mismatch makes every webhook fail, which is the safe failure.

### SAST-08 WebSocket media stream — Fixed with follow-up

- The stream URL embedded in TwiML carries a four-hour HMAC (`STREAM_SIGNING_SECRET`, or the Twilio auth token if that secret is unset).
- When a signing secret exists, or when `NODE_ENV=production`, the socket is closed unless the token is valid. Patient id, appointment id, and mode come from the token, not from query parameters the client can edit.
- The socket server caps payload size (1 MB), total connections (default 50), and connections per address (default 8), and closes an idle socket after two hours.
- mulaw-to-wav conversion uses async `ffmpeg` instead of `spawnSync`, so one conversion no longer blocks every other call.

Local development without a signing secret still accepts query parameters so existing local tests keep working. Production does not.

### SAST-09 Secrets and PHI in logs — Fixed with follow-up

- `ApiTokenGuard` no longer logs the presented token, the expected token, or the raw `Authorization` header. Comparison uses `crypto.timingSafeEqual`.
- Eligibility, transcript, Gemini, chat, and status-callback logs no longer include payloads. They log identifiers and status only.

**Follow-up:** rotate `VERIFICATIONS_API_TOKEN` and restrict or delete logs that were written before this change. The comparison is constant-time, but it is still one shared bearer token. Per-client credentials would be a separate design.

### SAST-23 Path traversal in `/transcription/transcribe` — Fixed

The AI server no longer uses the client filename. Uploads are written as `<uuid>.<allow-listed extension>` under the upload directory, the resolved path is checked, the write stops at 25 MB, and errors returned to the caller do not include the exception text. The route also requires the service token (SAST-04).

## Medium

### SAST-10 Input validation — Fixed

`ValidationPipe` is global with `whitelist`, `forbidNonWhitelisted`, and `transform`. Request bodies that only had Swagger decorators (appointment create, eligibility save, AI proxy, Twilio dial) now have class-validator decorators so legitimate fields are kept and unknown fields are rejected.

Appointment create still accepts the nested Sabrina document via `@Allow()` on the known properties. A property that is not declared on `AppointmentDetailsDto` is rejected.

### SAST-11 Authentication hardening — Partial

Done:

- New passwords must be at least 12 characters and include upper case, lower case, and a digit. Login still accepts existing shorter passwords.
- bcrypt cost is 12 for new passwords.
- Login and registration are limited to 10 requests per minute. The rest of the API is limited to 300 requests per minute.
- Duplicate registration returns `Unable to complete registration` and does not say that the email exists.
- Default JWT lifetime is 12 hours (`JWT_EXPIRATION` still overrides it).

Not done: multi-factor authentication, and moving the access token into an `HttpOnly` cookie with rotating refresh tokens. That replaces how the dashboard stores the session and needs your acknowledgement. Shortening the token to 15 minutes without a refresh flow would sign operators out during a normal work session, so the default was reduced from 1 day to 12 hours instead.

### SAST-12 HTTP hardening and Swagger — Fixed with follow-up

- `helmet` is enabled. Content Security Policy is on in production.
- JSON and form bodies are limited to 1 MB. Audio uploads use their own 25 MB limit.
- Swagger at `/api` is mounted only when `NODE_ENV` is not `production`.
- `ngrok-skip-browser-warning` is not an allowed CORS header in production, and the client sends it only in a development build.
- Production startup refuses to boot unless `CORS_ORIGINS` is set (along with the other required settings below).

### SAST-13 File upload limits — Fixed

Backend transcription and verification audio uploads allow only audio extensions and audio MIME types, use a server-generated name, and cap the file at 25 MB. The AI emotion and transcription routes do the same.

### SAST-14 Prompt injection and model output — Partial

Caller speech is wrapped as untrusted data and cannot be used, by instruction, to change the SSN rule. Eligibility values are reduced to allow-listed key characters, control characters are removed, and each value is capped at 500 characters before the Sabrina payload is built.

A full human review step for high-impact benefit fields, and a red-team suite for the voice flow, were not added. Those are process items, not a single code change.

### SAST-15 Insecure defaults — Fixed with follow-up

Removed:

- Sabrina verification code fallback `123456`
- silent default of the Sabrina API to the UAT host
- hardcoded agent number used by IVR option 4
- cleartext default hold-music URL (the default is now `https`)

If `SABRINA_API_URL`, `SABRINA_VERIFICATION_CODE`, or the IVR agent number is missing, that feature fails instead of using a built-in value. Option 4 tells the caller an agent is unavailable when the number is missing or not a plausible phone number.

Production startup also requires `JWT_SECRET`, `SSN_ENCRYPTION_KEY`, Twilio account settings, `BACKEND_URL` (https), `VERIFICATIONS_API_TOKEN`, `AI_SERVICE_TOKEN`, `DATABASE_URL`, and `CORS_ORIGINS`.

### SAST-16 Dependencies — Fixed with follow-up

- `multer` is `2.5.0` (was pinned to the vulnerable `2.4.0` by an override).
- `body-parser` override is `2.4.0`.
- `fast-uri` override is `4.2.3`.
- `qs` override is `6.17.0` (the previous pin `6.16.0` was still in the advisory range).
- Unused `class`, `uuidv4`, and `sqlite3` packages were removed.
- `package-lock.json` is no longer gitignored. The backend Dockerfile installs with `npm ci`.
- The AI `requirements.txt` no longer uses `--extra-index-url`, which would let every Python package resolve from the PyTorch index.

`npm audit` in `apps/backend` after the update reports **no high or critical issues**. Six low findings remain in Jest's dependency tree. The audit's suggested fix downgrades Jest to version 25, which would break the test runner, so those were left.

`@prisma/orm-mongo@8.0.0-rc.17` is still a release candidate. Replacing the ORM is an application-wide change and was not done.

Python dependencies are still mostly unpinned and are not hashed. Generating a hash lock with `pip-compile` should be a dedicated change so the AI image is not broken by a guessed pin.

### SAST-17 Containers — Partial

Done:

- Backend image is `node:22-alpine` and runs as user `app`.
- AI image is `python:3.12-slim` and runs as user `appuser`.
- MongoDB image is pinned to `mongo:7`.
- MongoDB and the AI server are published on `127.0.0.1` only.
- `.dockerignore` files exclude git metadata, caches, env files, recordings, and bytecode.

Not done, because they change local Docker and the database connection for every environment:

- MongoDB authentication and TLS
- removing the `.:/app` bind mount from compose
- a read-only root filesystem (the app writes uploads, call audio, and model caches)

## Low and informational

### SAST-18 RolesGuard — Fixed

The guard reads `@Roles()` from the method and the controller class. If a role is required and `request.user` is missing, the guard denies the request. Routes with no `@Roles()` stay available to any authenticated user, which is the intended default once the global JWT guard is in place.

### SAST-19 Repository hygiene — Partial

Removed from the working tree and ignored going forward:

- the captured git log file `e`
- the call recording under `apps/outputcalls/`
- Python `__pycache__` bytecode
- `apps/backend/desktop.ini`

`IVR_SETUP.md` no longer contains account SIDs or real phone numbers.

`apps/backend/src/assets/audio/audioTest.mp3` is still in the tree. The debug endpoint that used it was removed. Confirm the file is synthetic; if it is not, delete it and purge history.

Git history was not rewritten. `git filter-repo` rewrites published history and needs your explicit approval.

### SAST-20 TwiML injection — Fixed

Dynamic values in the legacy step, gather, IVR dial, and recording responses go through `escapeXmlAttr` or `escapeXmlText`. `payeeId` must match `^[A-Za-z0-9_-]{1,80}$` before it is placed in a URL.

### SAST-21 Debug endpoints — Fixed

- `GET /transcription/transcribe-test` was removed.
- The media-stream connection no longer prints the WebSocket URL.
- Barge-in failures return `Barge-in failed` and do not forward the underlying error string.
- The ngrok bypass header is development-only.

### SAST-22 Python bind address and subprocess — Fixed for local runs

`main.py` and `run.py` bind to `127.0.0.1` unless the process is the container command, which still listens on `0.0.0.0` inside the container network. The root `npm run ai-server` script also binds to `127.0.0.1`. Subprocess arguments were already fixed lists with no shell. They were left as they are.

## Environment variables you need to set

| Variable | Where | Why |
| --- | --- | --- |
| `AI_SERVICE_TOKEN` | `apps/backend/.env` | Shared secret between the API and the AI server. Compose loads this file into both. |
| `SSN_ENCRYPTION_KEY` | backend, required in production | 32-byte key for payee SSN encryption. |
| `SABRINA_API_URL` | backend | Must be `https://...`. There is no UAT fallback. |
| `SABRINA_VERIFICATION_CODE` | backend | Required. `123456` is no longer used. |
| `IVR_AGENT_PHONE_NUMBER` | backend | E.164 number for IVR option 4. |
| `CORS_ORIGINS` | backend, required in production | Comma-separated browser origins. |
| `BACKEND_URL` | backend | Public `https` URL Twilio uses. Signature checks depend on it. |
| `STREAM_SIGNING_SECRET` | backend, optional | HMAC for media-stream tokens. Falls back to `TWILIO_AUTH_TOKEN`. |
| `QDRANT_API_KEY` | AI server | Turn on the Qdrant key before that service is reachable. |

After deploying, rotate the Twilio Auth Token and `VERIFICATIONS_API_TOKEN`, then update the environment and Twilio console. Audit `User.role` for unexpected administrators.

## Second pass (cookie sessions, appointment SSN encryption, history purge)

### HttpOnly cookies, refresh tokens, and administrator MFA

The browser no longer stores an access token. Login sets three cookies:

| Cookie | Who can read it | Lifetime | Purpose |
| --- | --- | --- | --- |
| `eva_access` | HTTP only | 15 minutes | JWT for API calls |
| `eva_refresh` | HTTP only, path `/auth` | 12 hours, or 7 days with Remember me | Rotating session |
| `eva_csrf` | Readable by script | Same as the refresh cookie | Sent as `X-CSRF-Token` when `COOKIE_SAMESITE=none` |

The refresh token is stored only as a SHA-256 hash in the `auth_sessions` collection. Each refresh replaces it. Presenting an already-used token deletes that session family.

Operators get cookies after the password check. Administrators do not. On the first admin login the API returns a QR code and an `otpauth://` URI. After the authenticator code is confirmed, eight single-use recovery codes are shown once and stored as SHA-256 hashes in `user_security`. Later admin logins require a 6-digit code or a recovery code. `POST /user/:id/mfa/reset` (administrator) clears that enrollment.

Bearer tokens still work for non-browser clients. A token whose payload contains `purpose` is rejected, so an MFA challenge token cannot be used as a session.

Set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` only when the dashboard and API are on different sites. The default is `Lax`, which is correct for localhost ports and for hosts that share a site.

### Appointment SSNs from Sabrina

SSN fields (`SSN`, `Patient_SSN`, `ssn`, and the same names nested in the document) are encrypted with the existing AES-256-GCM helper before insert into `appointments`, `sabrina_appointments`, and `sabrina_response`. Reads rewrite any remaining plaintext. The dashboard receives `ssnOnFile` and never the ciphertext. Voice prompts still receive only the last four digits, decrypted in memory.

Provider tax ID fields are not treated as patient SSNs.

### Git history

Local history on `EVA-Testing-V1` was rewritten. These paths are no longer in any commit or in the stash:

- `e`
- `apps/outputcalls/RE3c5c7eb1fc900a767e43ad7e6d515913.wav`
- `apps/outputcalls/REfe7ebaddbfb39db26b86f63e9bdd7ed2.wav`
- `apps/outputcalls/RE0c0b76af5f2b352ead345fbfc07adea2.wav`

The last two recordings were in the same folder as the file named in the assessment, so the whole `apps/outputcalls` directory was removed. `origin` is still `https://github.com/Yahwanth-ISpace/CovrAi.git`. Nothing was pushed. The rewritten branch has new commit ids, so updating GitHub requires a force push, which was not run. After that push, other clones should be re-cloned. Until then, GitHub still has the old objects.

## Changes that still need your acknowledgement

1. **MongoDB authentication, dropping the compose source bind mount, and a read-only container filesystem.** This changes `DATABASE_URL` everywhere and how local Docker runs.
2. **Replace `@prisma/orm-mongo` 8.0.0-rc.17** and generate a hashed Python lockfile.

Name-and-date-of-birth appointment matching was removed. Administrators and operators are both staff monitors and see the same appointment and verification lists. Operators can delete those records and edit extracted fields. The other administrative actions stay with administrators.
