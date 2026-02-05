# IVR Complete Setup Guide (Twilio)

This guide walks you through the full setup for the IVR with **two Twilio accounts**, including environment variables and Twilio Console configuration.

---

## Two-account setup: EVA calls IVR → STT presses 4 → redirect to agent

You have:

- **Twilio EVA** (call trigger): number **+14847598215**, Account SID `AC57e2f9f7957037e3bbd666b074b8eb4d`. Used to **place the call** to the IVR and to **send DTMF 4**.
- **Twilio IVR**: number **+15158825548**, Account SID `AC772fedd62d65d0e08dd81d4696bd64f5`. This number **plays the IVR menu** when someone calls it.

**Flow:** Trigger a call from EVA → backend uses **EVA credentials** to dial **+15158825548** → IVR account answers with the IVR menu → backend **streams** that audio, runs **ElevenLabs STT (Whisper fallback)** → when it hears “customer agent” it **sends DTMF 4** → IVR runs option 4 (10s hold, then dial **IVR_AGENT_PHONE_NUMBER**).

### Backend `.env` (EVA account only)

The backend uses **only the EVA account** for placing the call and redirecting to play DTMF 4. Set:

```env
BACKEND_URL=https://your-backend-url.com

# EVA account (call trigger from +14847598215)
TWILIO_ACCOUNT_SID=AC57e2f9f7957037e3bbd666b074b8eb4d
TWILIO_AUTH_TOKEN=<your-EVA-auth-token>
TWILIO_PHONE_NUMBER=+14847598215

# IVR number that EVA will call (on the other account)
TWILIO_IVR_PHONE_NUMBER=+15158825548

# Where option 4 redirects the call (customer agent)
IVR_AGENT_PHONE_NUMBER=+919515663123
```

Do **not** put the IVR account’s auth token in the backend; the IVR account is only used in the Twilio Console to set the webhook on +15158825548.

### IVR account Console (number +15158825548)

1. Log in to the **IVR** Twilio account (SID `AC772fedd62d65d0e08dd81d4696bd64f5`).
2. Go to **Phone Numbers** → **Manage** → **Active Numbers** → click **+15158825548**.
3. Under **Voice** → **A CALL COMES IN**: set **Webhook** to `https://YOUR_BACKEND_URL/twilio/inbound`, **HTTP POST**.
4. Save.

When EVA (or anyone) calls +15158825548, this IVR account will request your backend and get the IVR menu (Press 1–4). After we send DTMF 4, the IVR returns option 4 TwiML (hold 10s, dial `IVR_AGENT_PHONE_NUMBER`).

### How to trigger the flow

- **POST** `https://YOUR_BACKEND_URL/twilio/call-ivr-and-bypass`  
  (optional body: `{ "to": "+15158825548" }` if you want to override the IVR number).

The backend will place an outbound call from **+14847598215** to **+15158825548**, listen via STT for “customer agent”, send 4, and the IVR will redirect to the customer agent number.

---

## IVR Flow (What the caller hears)

| Key | Option | What happens |
|-----|--------|--------------|
| **1** | Regarding complaint | Message: complaint selected; team will note; email support@wentdentals.com. Then hang up. |
| **2** | Register insurance | Message: insurance registration; visit website or call during business hours. Then hang up. |
| **3** | Fetch latest insurance offers | Message: latest offers on website. Then hang up. |
| **4** | Talk to customer agent | “Please hold…” → **hold 10 seconds** → call is **redirected to 9515663123** (or your configured agent number). If no answer in 30s, message and hang up. |

**Menu (played on every inbound call):**  
*“Thank you for calling. Press 1 regarding complaint. Press 2 to register insurance. Press 3 to fetch latest insurance offers. Press 4 to talk to our customer agent.”*

---

## 1. Environment variables (backend)

Set these in `apps/backend/.env` (or your deployment environment).

### Required for IVR

| Variable | Description | Example |
|----------|-------------|--------|
| `BACKEND_URL` | Public HTTPS URL of your backend (Twilio must reach this). | `https://your-api.example.com` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (the account that **receives** the IVR calls and/or that you use for dial-out). | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Auth token for the same account. | `your_auth_token` |
| `TWILIO_PHONE_NUMBER` | Twilio number used as **caller ID** when dialling the agent (option 4). Must belong to the same account as SID/Token. E.164 format. | `+15551234567` |

### Agent number (option 4)

| Variable | Description | Example |
|----------|-------------|--------|
| `IVR_AGENT_PHONE_NUMBER` or `TWILIO_AGENT_PHONE_NUMBER` | Number to which **option 4** redirects the call (customer agent). Use E.164 (e.g. `+919515663123` for India). | `+919515663123` |

- If **neither** is set, the backend uses the default **+919515663123** (9515663123 with India +91).
- To use a different number (e.g. US), set `IVR_AGENT_PHONE_NUMBER=+1XXXXXXXXXX`.

### EVA calls IVR and bypasses to customer agent (option 4)

| Variable | Description | Example |
|----------|-------------|--------|
| `TWILIO_IVR_PHONE_NUMBER` | The **IVR number** that EVA (your Twilio account) will **call**. When EVA calls this number, the backend streams the call audio, uses **ElevenLabs STT with Whisper fallback** to transcribe the IVR menu, and when it hears “customer agent” (or “press 4 to talk”), it sends **DTMF 4** so the IVR runs option 4 (10s hold, then dial 9515663123). | `+15551234567` (the number that has the IVR on the other account) |

### Optional

- **Call status**: To receive call status events, set the Twilio number’s “Status callback URL” to `{{BACKEND_URL}}/twilio/status` (implement handler if needed).

---

## 2. Twilio Console setup (per number)

Do this for **each** Twilio number that should run this IVR (e.g. one in Account 1, one in Account 2).

### Step 1: Log in and open the number

1. Go to [Twilio Console](https://console.twilio.com) and log in (Account 1 or Account 2).
2. Go to **Phone Numbers** → **Manage** → **Active Numbers**.
3. Click the phone number that will receive the IVR calls.

### Step 2: Voice webhook (A CALL COMES IN)

Under **Voice Configuration**:

1. **A CALL COMES IN**: choose **Webhook**.
2. **URL**:  
   `https://YOUR_BACKEND_DOMAIN/twilio/inbound`  
   Replace `YOUR_BACKEND_DOMAIN` with your actual `BACKEND_URL` (e.g. `https://api.wentdentals.com`).
3. **HTTP**: **POST**.

Click **Save**.

### Step 3: Second account (second number)

1. Log in to the **second** Twilio account.
2. Open the number that should run the same IVR.
3. Set **A CALL COMES IN** to the **same** URL:  
   `https://YOUR_BACKEND_DOMAIN/twilio/inbound`  
   **HTTP**: **POST**.  
   Save.

Both numbers will now use the same IVR (same backend). Who gets the call depends on which number the customer dials.

---

## 3. Using two Twilio accounts

You have two main ways to use two accounts with **one** backend.

### Option A: One backend, two numbers (recommended)

- **Account 1**: Number A → Voice webhook = `https://your-backend.com/twilio/inbound` (POST).
- **Account 2**: Number B → Voice webhook = `https://your-backend.com/twilio/inbound` (POST).

In `.env` you set **one** set of Twilio credentials:

- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` = from **one** of the two accounts (typically the one you use for **outbound** or for **caller ID** when transferring to the agent).

Result:

- Incoming calls to **either** number play the same IVR (1–4).
- Option 4 (hold 10s, then redirect) uses the **single** `TWILIO_PHONE_NUMBER` as caller ID and dials `IVR_AGENT_PHONE_NUMBER` (or default 9515663123). So **both** numbers transfer to the same agent number.

Use this when both accounts should behave the same and transfer to the same agent (9515663123).

### Option B: Two backends (one per account)

If you want **different** behaviour or **different** agent numbers per account:

- **Backend 1** (e.g. `https://backend1.example.com`):
  - `.env`: Account 1’s `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and (optional) `IVR_AGENT_PHONE_NUMBER`.
  - `BACKEND_URL=https://backend1.example.com`
- **Backend 2** (e.g. `https://backend2.example.com`):
  - `.env`: Account 2’s credentials and number, and (optional) a different `IVR_AGENT_PHONE_NUMBER`.
  - `BACKEND_URL=https://backend2.example.com`

Then:

- Account 1 number → Voice webhook: `https://backend1.example.com/twilio/inbound` (POST).
- Account 2 number → Voice webhook: `https://backend2.example.com/twilio/inbound` (POST).

Each account’s calls are handled by its own backend and its own agent number.

---

## 4. Backend URLs Twilio will call

| URL | When | Purpose |
|-----|------|--------|
| `POST {{BACKEND_URL}}/twilio/inbound` | Inbound call to your Twilio number | Plays IVR menu and gathers 1 digit. |
| `POST {{BACKEND_URL}}/twilio/ivr-menu` | After caller presses 1, 2, 3, or 4 | Handles the chosen option (message + hangup, or hold 10s + dial 9515663123 for option 4). |

Ensure:

- `BACKEND_URL` is **HTTPS** in production (Twilio requires HTTPS for webhooks).
- Your server is reachable from the internet (no firewall blocking Twilio).

---

## 5. Quick checklist

- [ ] `BACKEND_URL` set and reachable over HTTPS.
- [ ] `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` set (for the account you use for caller ID / dial-out).
- [ ] `TWILIO_PHONE_NUMBER` set (caller ID when transferring to agent).
- [ ] Agent number: either leave unset (default **+919515663123**) or set `IVR_AGENT_PHONE_NUMBER` (e.g. `+919515663123` or `+1XXXXXXXXXX`).
- [ ] **Account 1**: Phone number → Voice → A CALL COMES IN → Webhook → `https://YOUR_BACKEND_URL/twilio/inbound`, POST → Save.
- [ ] **Account 2**: Phone number → Voice → A CALL COMES IN → Webhook → `https://YOUR_BACKEND_URL/twilio/inbound`, POST → Save.

After this, calling **either** Twilio number will play the IVR; pressing **4** will hold for 10 seconds and then redirect the call to 9515663123 (or your configured agent number).

---

## 6. EVA calls IVR and bypasses to customer agent

Use this when **EVA’s Twilio account** should **call the IVR number** (e.g. the other account’s number), have the backend **listen** to the IVR menu via the media stream, and **automatically press 4** when it hears “customer agent” (using ElevenLabs STT with Whisper fallback). The IVR then runs option 4 (10s hold, dial to 9515663123).

1. **Set** `TWILIO_IVR_PHONE_NUMBER` to the IVR number (E.164). This is the number that plays the IVR menu (e.g. the number on your second Twilio account).
2. **Trigger the call** from your app by calling:
   - `POST {{BACKEND_URL}}/twilio/call-ivr-and-bypass`
   - Optional body: `{ "to": "+1..." }` to override the IVR number for that request.
3. **Flow:**
   - EVA’s Twilio places an outbound call to `TWILIO_IVR_PHONE_NUMBER`.
   - The call is connected to the media stream with `mode=ivr-bypass`.
   - The backend receives the IVR’s audio, runs **ElevenLabs STT** (with **Whisper fallback** if needed) on chunks every ~2.5 s.
   - When the transcript contains **“customer agent”**, **“press 4 to talk”**, **“talk to our customer agent”**, or **“option 4”**, the backend **redirects the call** to `{{BACKEND_URL}}/twilio/play-dtmf-4`, which returns TwiML `<Play digits="4"/>`.
   - The IVR receives DTMF 4, runs option 4: “Please hold”, 10s pause, then dials 9515663123 (or your agent number).
   - The call is then connected to the customer agent.
