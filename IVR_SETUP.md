# IVR Setup Guide (Twilio)

This guide covers environment variables and Twilio console setup for the IVR flow, including using **two Twilio accounts** (e.g. one for the main IVR line, one for outbound/agent).

---

## IVR Flow Summary

| Key | Action |
|-----|--------|
| **1** | Complaints — play message, then hang up |
| **2** | Register insurance — play message, then hang up |
| **3** | Latest insurance offers — play message, then hang up |
| **4** | Talk to agent — “Please hold”, **hold 10 seconds**, then **dial** the configured agent number |

---

## 1. Environment Variables (Backend)

Set these in `apps/backend/.env` (or in your deployment environment).

### Required for IVR

| Variable | Description | Example |
|----------|-------------|--------|
| `BACKEND_URL` | Public URL of your backend (Twilio must reach this over HTTPS in production). | `https://your-api.example.com` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (Account 1 or 2, depending which number receives the call). | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token for the same account. | `your_auth_token` |
| `TWILIO_PHONE_NUMBER` | Twilio number used as **caller ID** when dialling the agent (option 4). Must be from the same account as SID/Token. | `+15551234567` |
| `IVR_AGENT_PHONE_NUMBER` or `TWILIO_AGENT_PHONE_NUMBER` | Number to which **option 4** transfers the call (customer agent). | `+15559876543` |

- If `IVR_AGENT_PHONE_NUMBER` is not set, `TWILIO_AGENT_PHONE_NUMBER` is used.
- If neither is set, option 4 plays “unable to transfer” and hangs up.

### Optional

- **Call status**: If you want status callbacks, set the Twilio number’s “Status callback URL” to `{{BACKEND_URL}}/twilio/status` (handled by the backend).

---

## 2. Twilio Console Setup (Per Account)

Do this for **each** Twilio number that should run the IVR (e.g. one per account).

### Step 1: Open Phone Number

1. Log in to [Twilio Console](https://console.twilio.com).
2. Go to **Phone Numbers** → **Manage** → **Active Numbers**.
3. Click the number that will receive the IVR calls.

### Step 2: Configure Voice Webhook

Under **Voice Configuration**:

- **A CALL COMES IN**: Webhook.
  - **URL**: `https://your-backend-domain.com/twilio/inbound`  
    (Use your real `BACKEND_URL`; must be **HTTPS** in production.)
  - **HTTP**: `POST`.

Leave “Status callback URL” blank unless you want call status events; if you do, set it to `{{BACKEND_URL}}/twilio/status`.

Save.

### Step 3: Repeat for Second Account (If Using Two Accounts)

- Log in to the **second** Twilio account.
- Use a **different** phone number.
- Set that number’s “A CALL COMES IN” URL to the **same** backend URL:  
  `https://your-backend-domain.com/twilio/inbound`  
  if you use **one backend** for both numbers.

If you use **two backends** (one per account), set each number’s webhook to its own backend URL (see section 4).

---

## 3. Using Two Twilio Accounts

You have two main options.

### Option A: One Backend, Two Numbers (Same or Different Accounts)

- **Account 1**: Number A → webhook `https://your-backend.com/twilio/inbound`.
- **Account 2**: Number B → webhook `https://your-backend.com/twilio/inbound`.

The **same** backend serves both. The backend today uses a **single** set of Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`). So:

- Incoming calls to **either** number will get the IVR (1–4) and option 4 (hold 10s + dial) will use the **one** configured `TWILIO_PHONE_NUMBER` and `IVR_AGENT_PHONE_NUMBER`.  
- For **outbound** calls (e.g. EVA flow), only the account whose credentials are in `.env` will be used.

So “two accounts” with **one backend** means: both numbers can run the same IVR, but **dial-out and caller ID** for option 4 come from whichever single account you put in `.env`.

### Option B: Two Backends (One Per Account)

- **Backend 1** (e.g. `https://backend1.example.com`):
  - `.env`: Account 1’s `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and `IVR_AGENT_PHONE_NUMBER`.
  - `BACKEND_URL=https://backend1.example.com`
- **Backend 2** (e.g. `https://backend2.example.com`):
  - `.env`: Account 2’s credentials and number, and (if needed) a different agent number.
  - `BACKEND_URL=https://backend2.example.com`

Then:

- **Account 1** number → Voice webhook: `https://backend1.example.com/twilio/inbound`.
- **Account 2** number → Voice webhook: `https://backend2.example.com/twilio/inbound`.

Each account’s calls are fully handled by its own backend and its own agent number.

---

## 4. Quick Checklist

- [ ] `BACKEND_URL` is set and reachable by Twilio (HTTPS in production).
- [ ] `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` set for the account that owns the IVR number (and, for option 4, the caller ID).
- [ ] `TWILIO_PHONE_NUMBER` set (used as caller ID when dialling the agent).
- [ ] `IVR_AGENT_PHONE_NUMBER` or `TWILIO_AGENT_PHONE_NUMBER` set (transfer target for option 4).
- [ ] In Twilio: “A CALL COMES IN” → **Webhook**, **POST** → `{{BACKEND_URL}}/twilio/inbound`.
- [ ] If using a second account: either same webhook (Option A) or second backend URL (Option B).

After this, calling the Twilio number will play the IVR; pressing **4** will hold for 10 seconds and then ring the configured agent number.
