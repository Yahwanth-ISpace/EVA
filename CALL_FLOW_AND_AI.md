# Call Flow & AI (EVA)
# Call Flow & AI (EVA)

**EVA** = Reena, AI voice agent from Went Dentals. **User** = person on the call (e.g. insurance rep).
**EVA** = Reena, AI voice agent from Went Dentals. **User** = person on the call (e.g. insurance rep).

---

## 1. High-Level Call Flows

### 1.1 Outbound verification call (EVA flow)

1. **Start:** Client creates an appointment (or triggers a call) with `payeeId`. Backend calls `makeCall(to, payeeId)`.
2. **Twilio** dials the number; when answered, Twilio requests the webhook URL:  
   `GET/POST /twilio/inbound-stream?payeeId=...`
3. Backend returns **TwiML** with `<Connect><Stream url="wss://.../twilio/media-stream?payeeId=..."/></Connect>`.
4. **WebSocket** to `/twilio/media-stream` is opened. If `payeeId` is missing from the URL, we resolve it from the **call SID** (stored when `makeCall` was used).
5. **Patient info** is loaded from the DB for that `payeeId` (name, DOB, SSN) so EVA can answer identity/patient questions.
6. EVA speaks the **greeting:** *"Hi, I'm Reena from Went Dentals. How are you doing?"*
7. **Turn loop:** User speaks → we buffer audio → on silence (or max buffer), we transcribe (Whisper) → send transcript + current `extractedData` + `patientInfo` to **AI** (`getNextConversationTurn`) → AI returns `nextMessage`, `extractedUpdates`, `endCall` → we merge updates, validate/normalize (dollars → **$**, percent → **%**), speak EVA’s reply.
8. **Confirmation:** After the user gives a value, EVA acknowledges then asks one of: *"Is it okay?"* / *"Is that all you have?"* / *"Are we good?"* and does **not** ask for the next field until the user confirms (e.g. "Yes", "Thank you").
9. **Recall:** If the user asks *"What is the deductible?"* or *"What did I say for copay?"*, we answer **from stored `extractedData`** (code path `getRecallReply`) so the value is always correct (e.g. *"I have the deductible as $500."*).
10. **End:** We end the call only when **all four fields** (coverage, deductible, copay, validity) are collected **and** the user says *thank you* / *that's all* / *we're done* / *goodbye*. EVA says a short closing (e.g. *"Thank you for confirming the details. That's all I have. Have a good day."*), then we stay on the line briefly (post-goodbye); if the user says something, we answer and ask *"Is that all you have?"* and end when they confirm.
11. **Save:** When the call ends, we push **extracted data** and the **conversation transcript** (User/EVA lines) to the verification record via `saveCallVerification(payeeId, extractedData, fullTranscript)`.

### 1.2 Inbound IVR (separate flow)

- Inbound call hits **`/twilio/inbound`**. We play a menu: *Press 1 for complaints, 2 to register insurance, 3 for latest offers, 4 to speak with an agent.*
- **Option 4:** *"Please hold"* → 10 s pause → `<Dial>` to the configured agent number. Other options play a message and hang up.
- See **IVR_SETUP.md** for env vars and Twilio setup.

---

## 2. What We Collect (Benefit Fields)

| Field       | Meaning              | Stored format | Example   |
|------------|----------------------|---------------|-----------|
| coverage   | Coverage (e.g. %)     | **%**         | `80%`     |
| deductible | Deductible amount    | **$**         | `$500`    |
| copay      | Copay (dollars or %) | **$** or **%**| `$90` or `25%` |
| validity   | Plan validity date    | Date          | `21st Dec 2028` |

Dollar amounts are normalized to **$** (e.g. `$500`). Percentages to **%** (e.g. `80%`). Validity is normalized to a short date string.
## 1. High-Level Call Flows

### 1.1 Outbound verification call (EVA flow)

1. **Start:** Client creates an appointment (or triggers a call) with `payeeId`. Backend calls `makeCall(to, payeeId)`.
2. **Twilio** dials the number; when answered, Twilio requests the webhook URL:  
   `GET/POST /twilio/inbound-stream?payeeId=...`
3. Backend returns **TwiML** with `<Connect><Stream url="wss://.../twilio/media-stream?payeeId=..."/></Connect>`.
4. **WebSocket** to `/twilio/media-stream` is opened. If `payeeId` is missing from the URL, we resolve it from the **call SID** (stored when `makeCall` was used).
5. **Patient info** is loaded from the DB for that `payeeId` (name, DOB, SSN) so EVA can answer identity/patient questions.
6. EVA speaks the **greeting:** *"Hi, I'm Reena from Went Dentals. How are you doing?"*
7. **Turn loop:** User speaks → we buffer audio → on silence (or max buffer), we transcribe (Whisper) → send transcript + current `extractedData` + `patientInfo` to **AI** (`getNextConversationTurn`) → AI returns `nextMessage`, `extractedUpdates`, `endCall` → we merge updates, validate/normalize (dollars → **$**, percent → **%**), speak EVA’s reply.
8. **Confirmation:** After the user gives a value, EVA acknowledges then asks one of: *"Is it okay?"* / *"Is that all you have?"* / *"Are we good?"* and does **not** ask for the next field until the user confirms (e.g. "Yes", "Thank you").
9. **Recall:** If the user asks *"What is the deductible?"* or *"What did I say for copay?"*, we answer **from stored `extractedData`** (code path `getRecallReply`) so the value is always correct (e.g. *"I have the deductible as $500."*).
10. **End:** We end the call only when **all four fields** (coverage, deductible, copay, validity) are collected **and** the user says *thank you* / *that's all* / *we're done* / *goodbye*. EVA says a short closing (e.g. *"Thank you for confirming the details. That's all I have. Have a good day."*), then we stay on the line briefly (post-goodbye); if the user says something, we answer and ask *"Is that all you have?"* and end when they confirm.
11. **Save:** When the call ends, we push **extracted data** and the **conversation transcript** (User/EVA lines) to the verification record via `saveCallVerification(payeeId, extractedData, fullTranscript)`.

### 1.2 Inbound IVR (separate flow)

- Inbound call hits **`/twilio/inbound`**. We play a menu: *Press 1 for complaints, 2 to register insurance, 3 for latest offers, 4 to speak with an agent.*
- **Option 4:** *"Please hold"* → 10 s pause → `<Dial>` to the configured agent number. Other options play a message and hang up.
- See **IVR_SETUP.md** for env vars and Twilio setup.

---

## 2. What We Collect (Benefit Fields)

| Field       | Meaning              | Stored format | Example   |
|------------|----------------------|---------------|-----------|
| coverage   | Coverage (e.g. %)     | **%**         | `80%`     |
| deductible | Deductible amount    | **$**         | `$500`    |
| copay      | Copay (dollars or %) | **$** or **%**| `$90` or `25%` |
| validity   | Plan validity date    | Date          | `21st Dec 2028` |

Dollar amounts are normalized to **$** (e.g. `$500`). Percentages to **%** (e.g. `80%`). Validity is normalized to a short date string.

---

## 3. Where AI Is Used (EVA Flow)
## 3. Where AI Is Used (EVA Flow)

### 3.1 `getNextConversationTurn` (main turn)
### 3.1 `getNextConversationTurn` (main turn)

- **When:** After each user utterance (transcribed).
- **Input:** `transcript`, `currentExtracted` (coverage, deductible, copay, validity), `patientInfo` (from DB), `lastAskedField` (for post-hold context).
- **Prompt:** EVA (Reena), Went Dentals, collecting the four benefit fields; rules for identity, patient name/DOB/SSN, confirmations, recall, corrections, hold; **data we have so far** is passed so the model can answer recall correctly.
- **Output:** `{ nextMessage, extractedUpdates, endCall }`. We merge `extractedUpdates` into `state.extractedData`, validate/normalize, then speak `nextMessage`.

### 3.2 Recall (code override)

- When the user asks *"What is the deductible?"* / *"What did I say for copay?"* etc., we **do not** rely only on the model. We call **`getRecallReply(userSaid, state.extractedData)`** and, if it returns a string, we use that as EVA’s reply (plus a random confirmation phrase). Values always come from stored **extractedData** (with **$** / **%** formatting).

### 3.3 `validateAndNormalizeBenefitExtracted`

- After we get `extractedUpdates`, we validate (e.g. coverage = percentage, deductible = dollars) and **normalize** for storage: dollars → **$**, percent → **%**.
- **When:** After each user utterance (transcribed).
- **Input:** `transcript`, `currentExtracted` (coverage, deductible, copay, validity), `patientInfo` (from DB), `lastAskedField` (for post-hold context).
- **Prompt:** EVA (Reena), Went Dentals, collecting the four benefit fields; rules for identity, patient name/DOB/SSN, confirmations, recall, corrections, hold; **data we have so far** is passed so the model can answer recall correctly.
- **Output:** `{ nextMessage, extractedUpdates, endCall }`. We merge `extractedUpdates` into `state.extractedData`, validate/normalize, then speak `nextMessage`.

### 3.2 Recall (code override)

- When the user asks *"What is the deductible?"* / *"What did I say for copay?"* etc., we **do not** rely only on the model. We call **`getRecallReply(userSaid, state.extractedData)`** and, if it returns a string, we use that as EVA’s reply (plus a random confirmation phrase). Values always come from stored **extractedData** (with **$** / **%** formatting).

### 3.3 `validateAndNormalizeBenefitExtracted`

- After we get `extractedUpdates`, we validate (e.g. coverage = percentage, deductible = dollars) and **normalize** for storage: dollars → **$**, percent → **%**.

### 3.4 `replyToUser` (post-goodbye)

- When the user says something after EVA has already said goodbye, we call `replyToUser(userMessage, patientInfo)` so EVA can answer briefly (e.g. a quick question) without repeating the full intro.

### 3.5 Other AI methods

- **`handleInterruption`** – Corrections / recall; can take `patientInfo`; used where we explicitly call it.
- **`extractInsuranceDetails`** – Used in other flows (e.g. upload recording, simulate); not in the live media-stream turn loop.

---

## 4. Technical Summary

| What                | How it works |
|---------------------|--------------|
| EVA identity        | Reena from Went Dentals; intro only at **start** of call, never repeated at end. |
| Patient data        | Loaded from DB by `payeeId` (or from call SID); passed into AI and used for identity/name/DOB/SSN. |
| Turn flow           | User speaks → transcribe → `getNextConversationTurn` → merge & validate → speak; repeat. |
| Confirmations       | After each value, EVA says one of *"Is it okay?"* / *"Is that all you have?"* / *"Are we good?"*; next field only after user confirms. |
| End call            | Only when all four fields collected **and** user says thank you / that's all / we're done / goodbye. |
| Stored values       | Dollars as **$** (e.g. `$500`), percentage as **%** (e.g. `80%`). |
| Transcript          | User/EVA lines accumulated during the call; saved into the verification `transcript` field when we push. |
| Hold / resume       | User can say *"Put me on hold"* / *"One moment"*; resume with *"Thank you for waiting"* / *"I'm back"*; we re-ask only the field we were on. |

---

## 5. User response timing (when to speak, avoiding cut-off)

When EVA asks a question, the system waits for **you to finish speaking** before sending your answer to transcription and the AI. To avoid only half your sentence being captured:

- **When to respond:** You can start speaking as soon as EVA finishes. There is a short guard (about **2 seconds**) after EVA stops so we don’t record EVA’s own voice; after that we are listening.
- **Pause when you finish:** After you finish your full answer, pause for about **0.7–1 second**. The system treats that as “user finished speaking” and then sends the full chunk for transcription. If you pause only briefly (e.g. 0.2–0.3 sec) in the middle of a sentence, it may treat that as “done” and capture only the first part (e.g. “The deductible is” and miss “ninety dollars”).
- **Long answers:** If you speak for more than about **6 seconds** without a pause, the system will process what it has so far and then continue. For normal answers (one sentence), a clear pause of ~1 second at the end is enough to capture everything.

**Summary:** Answer in full, then pause ~1 second so the system captures your complete response.

---

## 6. Legacy Step-Based Flow (TwiML)

The **`/twilio/step`** endpoint (and `twilio.service.steps`) is a **separate**, scripted flow using TwiML `<Play>` and `<Record>`. It is not the main EVA conversation. The main EVA flow is the **media stream** (WebSocket + `getNextConversationTurn`). The steps array in code can be updated to Reena + four benefit questions for consistency if that TwiML flow is still used.
### 3.4 `replyToUser` (post-goodbye)

- When the user says something after EVA has already said goodbye, we call `replyToUser(userMessage, patientInfo)` so EVA can answer briefly (e.g. a quick question) without repeating the full intro.

### 3.5 Other AI methods

- **`handleInterruption`** – Corrections / recall; can take `patientInfo`; used where we explicitly call it.
- **`extractInsuranceDetails`** – Used in other flows (e.g. upload recording, simulate); not in the live media-stream turn loop.

---

## 4. Technical Summary

| What                | How it works |
|---------------------|--------------|
| EVA identity        | Reena from Went Dentals; intro only at **start** of call, never repeated at end. |
| Patient data        | Loaded from DB by `payeeId` (or from call SID); passed into AI and used for identity/name/DOB/SSN. |
| Turn flow           | User speaks → transcribe → `getNextConversationTurn` → merge & validate → speak; repeat. |
| Confirmations       | After each value, EVA says one of *"Is it okay?"* / *"Is that all you have?"* / *"Are we good?"*; next field only after user confirms. |
| End call            | Only when all four fields collected **and** user says thank you / that's all / we're done / goodbye. |
| Stored values       | Dollars as **$** (e.g. `$500`), percentage as **%** (e.g. `80%`). |
| Transcript          | User/EVA lines accumulated during the call; saved into the verification `transcript` field when we push. |
| Hold / resume       | User can say *"Put me on hold"* / *"One moment"*; resume with *"Thank you for waiting"* / *"I'm back"*; we re-ask only the field we were on. |

---

## 5. User response timing (when to speak, avoiding cut-off)

When EVA asks a question, the system waits for **you to finish speaking** before sending your answer to transcription and the AI. To avoid only half your sentence being captured:

- **When to respond:** You can start speaking as soon as EVA finishes. There is a short guard (about **2 seconds**) after EVA stops so we don’t record EVA’s own voice; after that we are listening.
- **Pause when you finish:** After you finish your full answer, pause for about **0.7–1 second**. The system treats that as “user finished speaking” and then sends the full chunk for transcription. If you pause only briefly (e.g. 0.2–0.3 sec) in the middle of a sentence, it may treat that as “done” and capture only the first part (e.g. “The deductible is” and miss “ninety dollars”).
- **Long answers:** If you speak for more than about **6 seconds** without a pause, the system will process what it has so far and then continue. For normal answers (one sentence), a clear pause of ~1 second at the end is enough to capture everything.

**Summary:** Answer in full, then pause ~1 second so the system captures your complete response.

---

## 6. Legacy Step-Based Flow (TwiML)

The **`/twilio/step`** endpoint (and `twilio.service.steps`) is a **separate**, scripted flow using TwiML `<Play>` and `<Record>`. It is not the main EVA conversation. The main EVA flow is the **media stream** (WebSocket + `getNextConversationTurn`). The steps array in code can be updated to Reena + four benefit questions for consistency if that TwiML flow is still used.
