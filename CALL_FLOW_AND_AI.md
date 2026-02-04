# Call Flow Script & AI Impact

**Tool** = EVA (our AI bot) · **Agent** = User (human on the call)

---

## 1. Call Script (exact order)

| Step | Tool (EVA says) | Agent (User says) | What we do |
|------|-----------------|-------------------|------------|
| 0 | Hi how are you doing today | *(user responds)* | Listen → transcribe → advance |
| 1 | I am Jenifer, from Went Dentals | *(user responds)* | Listen → transcribe → advance |
| 2 | The patient name is Jhon Merick. The date of birth is March 31st 1992. | *(user responds)* | Listen → transcribe → advance |
| 3 | Tax ID is 170102. | *(user responds)* | Listen → transcribe → advance |
| 4 | 816 West Main Street, Danville, Virginia, 24541 | *(user responds)* | Listen → transcribe → advance |
| 5 | What do you want to know about the patient? | *(user responds)* | Listen → transcribe → advance |
| 6 | Can I get the coverage details of the patient? | e.g. "The coverage is 80%." | **AI extract** → update `coverage` → advance |
| 7 | Can you provide the deductible amount? | e.g. "The deductible is 50$" | **AI extract** → update `deductible` → advance |
| 8 | What is the copay? | e.g. "The copay is 25$" | **AI extract** → update `copay` → advance |
| 9 | What is the validity of the insurance? | e.g. "Validity is Dec 30th 2027" | **AI extract** → update `validity` → advance |
| 10 | Thank you, I am good. | *(user responds)* | Listen → advance |
| 11 | Thank you. | — | Call ends; if all 4 details collected → **upload to Verification DB** |

---

## 2. Actions performed (technical)

### When the call starts

1. **Twilio** connects the call to our WebSocket (`/twilio/media-stream?payeeId=...`).
2. We send **BOT_SCRIPT[0]** to **ElevenLabs** → get MP3 → convert to 8 kHz mulaw → stream chunks to Twilio (user hears “Hi how are you doing today”).
3. We start **buffering** incoming mulaw from the user and a **fallback timer** (4 s) in case silence isn’t detected.

### On every user utterance (after they stop talking)

1. **Silence detection**  
   We consider “user finished” when we have ≥ ~1 s of audio and the last ~0.5 s is mostly silence (mulaw bytes near 0xFF/0x7F).  
   **Barge-in:** If we’re still sending TTS and we detect enough user audio, we set `abortSpeaking` and stop sending more TTS chunks.

2. **Process buffer**  
   - Concatenate buffered mulaw → write temp `.raw` → **ffmpeg** mulaw→WAV → send WAV to **Whisper** (transcription service) → get **transcript**.

3. **Step logic**  
   - **Steps 0–5, 10:** No extraction. We only advance `currentStep` and speak the next script line.
   - **Steps 6–9:** We call **AI** (`getExtractionForStep`) to extract one field (coverage / deductible / copay / validity) from the transcript, update `state.extractedData`, append to `state.verificationTranscript`. We do **not** write to the DB yet.

4. **Next line**  
   We speak **BOT_SCRIPT[currentStep]** via ElevenLabs → mulaw → stream to Twilio.  
   We clear the incoming buffer at the start of each TTS so we don’t process overlap as the next turn.

### When the call ends

- We set `callEnded = true` when we’ve spoken the last line or on Twilio `stop` / WebSocket `close`.
- **Upload to Verification DB** only once: if we have **all four** (coverage, deductible, copay, validity) and the call has ended, we call `mergeExtractedData(payeeId, extractedData, verificationTranscript)`.

---

## 3. Where AI prompting impacts the conversation

Right now **only one AI prompt** is used during the call.

### 3.1 `getExtractionForStep` (steps 6–9 only)

- **When:** After the user speaks on steps 6, 7, 8, or 9 (coverage, deductible, copay, validity).
- **Input:**  
  - `transcript` = Whisper output of what the user said.  
  - `stepIndex` = 2 (coverage), 3 (deductible), 4 (copay), or 5 (validity).  
  - `questionText` = the line EVA just said (e.g. “Can I get the coverage details of the patient?”).
- **Prompt (summary):**  
  “We asked the user: ‘{questionText}’. They said: ‘{transcript}’. Extract ONLY the information that answers this question. Return a JSON object with a single field (e.g. `coverage`, `deductible`, `copay`, `validity`) with the extracted value or null.”
- **Output:** One field updated in `state.extractedData` (e.g. `coverage: "80%"`).
- **Impact on conversation:**  
  - EVA’s **words** are fixed script (BOT_SCRIPT); the LLM does **not** generate what EVA says.  
  - The LLM only **normalizes/parses** the user’s answer (e.g. “yeah it’s 80 percent” → `"80%"`) so we store clean values.  
  - So today, “human-like” behavior is mostly from **ElevenLabs voice** and **script wording**, not from open-ended AI dialogue.

### 3.2 Other AI methods (in code but not used in this flow)

- **`classifySegment`** – Answer vs interruption (not used; we use a strict script).
- **`handleInterruption`** – Corrections like “actually copay is 25%” (not used in this flow).
- **`getNextConversationTurn`** – Free-form next message + extraction (not used; we use BOT_SCRIPT instead).
- **`extractInsuranceDetails`** – Full extraction from a block of text (used in other flows, e.g. recording upload).

---

## 4. How to make the conversation more human-like

### 4.1 Keep script, add variety (no new AI)

- **Multiple phrasings per step**  
  e.g. for “coverage” use one of:  
  “Can I get the coverage details of the patient?” / “What’s the coverage?” / “And the coverage?”  
  Choose randomly or by round so it’s not the same line every time.

- **Short acknowledgments before the next question**  
  e.g. “Got it.” / “Thanks.” / “Okay.” then the next script line, so it feels like EVA heard them.

- **Softer closings**  
  e.g. “Thank you, I’m all set.” / “Thanks, have a good one.” instead of a single fixed “Thank you, I am good.”

### 4.2 Use AI to generate EVA’s next line (more human, more flexible)

- **Replace fixed BOT_SCRIPT with one LLM call per turn:**  
  Input: script step, last EVA line, last user transcript, and `extractedData` so far.  
  Output: single next line EVA should say (and optionally extracted field for steps 6–9).  
  Prompt can say: “You are Jenifer from Went Dentals, on a verification call. Keep replies to one short sentence. Be warm and natural. Next you need to [e.g. ask for deductible]. User just said: ‘…’. Reply with only the next thing to say.”

- **Use `getNextConversationTurn` (or a variant)**  
  Already returns `nextMessage` + `extractedUpdates`. You could use it for steps 6–9 instead of BOT_SCRIPT + `getExtractionForStep`, so EVA can say things like “Got it, 80%. And what’s the deductible?” in one go.

### 4.3 Handle interruptions and corrections (more human)

- **Re-enable `classifySegment` + `handleInterruption`**  
  When the user says something like “actually the copay is 25% not 30%”, classify as interruption, run `handleInterruption`, update `extractedData`, and have EVA say a short acknowledgment (“Got it, I’ve updated that.”) then continue from the right step.

### 4.4 Slightly longer, context-aware replies (still one sentence)

- **Prompt the LLM with role + goal + last exchange**  
  e.g. “You are Jenifer from Went Dentals. You’re collecting coverage, deductible, copay, validity. You just asked for coverage and the user said ‘80%’. Acknowledge and ask for the next piece in one short, natural sentence.”  
  Then use that sentence for TTS instead of the fixed script line.

---

## 5. Summary table

| What | Today | Possible improvement |
|------|--------|----------------------|
| What EVA says | Fixed BOT_SCRIPT lines | LLM-generated next line (same intent, more natural wording) |
| What we extract | getExtractionForStep (steps 6–9) | Keep; optional: merge with “next message” in one LLM call |
| Interruptions / corrections | Not handled | Use classifySegment + handleInterruption |
| Acknowledgments | None | Add “Got it.” / “Thanks.” or let LLM include them |
| Variety | Same script every call | Multiple phrasings per step or LLM-driven variation |

If you tell me which of these you want first (e.g. “add acknowledgments + one LLM-generated line per step”), I can outline the exact code changes next.
