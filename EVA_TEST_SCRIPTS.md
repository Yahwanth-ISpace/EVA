# EVA Test Scripts – User Scripts for Accurate Responses

Use these **exact or close phrases** so EVA (Reena) understands quickly. Speak clearly and wait for EVA to finish before you talk.

---

## 1. Happy Path (Smooth Flow)

**Goal:** Collect all four benefit fields with minimal back-and-forth.

| Step | You (user) say | What EVA does |
|------|----------------|----------------|
| 1 | EVA says: *"Hi, I am Reena from Went Dentals. How are you doing today?"* | — |
| 2 | **"I'm doing great, how can I help you?"** | Says she wants to verify benefits of a patient. |
| 3 | **"What do you need?"** or **"What details do you need?"** | Asks for first field (e.g. coverage). |
| 4 | **"Eighty percent."** (or **"Coverage is eighty percent."**) | Notes it, asks for deductible. |
| 5 | **"Eighty dollars."** (for deductible) | Notes it, asks for copay. |
| 6 | **"Ninety dollars."** (for copay) | Notes it, asks for validity. |
| 7 | **"December twenty-first, twenty twenty-eight."** (or **"Valid till December 2028."**) | Says thank you, closing line, then ends after a short wait. |
| 8 | **"Thank you."** (optional, if you speak before hang up) | Call ends. |

**Short happy-path script (copy-paste):**
```
I'm doing great, how can I help you?
What do you need?
Eighty percent.
Eighty dollars.
Ninety dollars.
December twenty-first, twenty twenty-eight.
Thank you.
```

---

## 2. Full Capabilities – Test All Features

Use this flow to test **identity, patient info, cross-questioning, hold/resume, confirmations, and corrections**.

### 2a. Greeting and identity

| Step | You say | EVA behavior |
|------|---------|--------------|
| 1 | (EVA greets) | — |
| 2 | **"I'm doing great, how can I help you?"** | "I want to verify the benefits of a patient." |
| 3 | **"What is the name of the patient?"** | Gives patient name, then "Is the value correct?" or "Are we good?" |
| 4 | **"Yes."** or **"Yeah, it's clear."** or **"We're good."** | "So can I get the next field?" (e.g. next info or coverage). |
| 5 | **"What is the date of birth of the patient?"** | Gives DOB, then asks for confirmation. |
| 6 | **"We're good."** | Asks for next field (e.g. "Can I get the coverage?"). |

### 2b. Giving benefit values with clear numbers

| Step | You say | EVA behavior |
|------|---------|--------------|
| 7 | **"What do you need?"** or **"What details do you need?"** | Asks for first missing field (e.g. coverage). |
| 8 | **"Coverage is eighty percent."** | Notes it, asks for deductible. |
| 9 | **"Deductible is one hundred dollars."** | Notes it, asks for copay. |
| 10 | **"Copay is ninety dollars."** | Notes it, asks for validity. |
| 11 | **"Validity is December twenty-first, twenty twenty-eight."** | Closing, then end. |

### 2c. Cross-questioning (recall, repeat, correct)

Use these **exact-style phrases** so EVA recognizes them:

| What you want to test | You say |
|------------------------|--------|
| What did I say for a field? | **"What did I say for deductible?"** or **"Do you have the copay?"** |
| Repeat the question | **"Can you repeat the question?"** or **"What was the question?"** |
| Confirm value | **"So you have deductible as one hundred dollars?"** or **"Confirm copay is ninety."** |
| Correct a value | **"Update the copay to twenty-five dollars."** or **"Actually deductible is fifty dollars not one hundred."** |
| Why do you need that? | **"Why do you need that?"** |

After EVA answers a question, she will say **"Is the value correct?"** or **"Are we good?"** — then you say:

- **"Yes."** / **"Yeah, it's right."** / **"It's clear."** / **"We're good."** / **"That's right."**

She will then say **"So can I get the next field?"** or **"Can I get the [field]?"** and continue.

### 2d. Hold and resume

| Step | You say | EVA behavior |
|------|---------|--------------|
| — | **"Put the call on hold."** or **"One moment please."** or **"Please hold."** | "Sure, I'll hold. Take your time." — no processing until you resume. |
| (wait a few seconds) | **"Thank you for waiting. Are you there?"** or **"I'm back."** or **"Are you still there?"** or **"Thanks for waiting on hold."** | "No problem, thank you for getting back. I'm still here." — flow continues (e.g. can give copay or ask what was needed). |

**Hold phrases EVA understands:**
- "Put the call on hold."
- "Put me on hold."
- "One moment."
- "Please hold."
- "Please wait."
- "I'm putting the call on hold."

**Resume phrases EVA understands:**
- "I'm back."
- "Thank you for waiting."
- "Thanks for staying on hold."
- "Thanks for waiting on hold."
- "Are you there?"
- "Are you still there?"
- "Are you online?"
- "We're back on the line."
- "Let's continue."
- "Ready to continue."
- "I'm ready."
- "Hold is off."

### 2e. End of call (thank you / goodbye)

| You say | EVA behavior |
|---------|--------------|
| **"Thank you."** / **"Thanks."** | Ends call (after closing line). |
| **"That's all."** / **"We're done."** / **"Goodbye."** / **"Nothing else."** | Same. |

---

## 3. Quick Reference – Phrases EVA Recognizes

### Greeting / flow
- **"I'm doing great, how can I help you?"**
- **"What do you need?"** / **"What details do you need?"** / **"What are the details you want to know?"**

### Patient / identity
- **"What is the name of the patient?"** / **"Patient name?"**
- **"What is the date of birth of the patient?"** / **"Date of birth?"** / **"DOB?"**
- **"Who are you?"** / **"Identify yourself."**

### Confirmations (after EVA asks "Is the value correct?" / "Are we good?")
- **"Yes."** / **"Yeah, it's right."** / **"It's clear."** / **"We're good."** / **"Correct."** / **"That's right."**

### Benefit values (say clearly)
- Coverage: **"Eighty percent."** / **"Coverage is eighty percent."**
- Deductible: **"One hundred dollars."** / **"Deductible is one hundred dollars."**
- Copay: **"Ninety dollars."** / **"Copay is ninety dollars."**
- Validity: **"December twenty-first, twenty twenty-eight."** / **"Valid till December 2028."**

### Cross-questioning
- **"What did I say for deductible?"** / **"Do you have the copay?"**
- **"Can you repeat the question?"** / **"What was the question?"**
- **"Update the copay to twenty-five dollars."** / **"Change deductible to fifty."**
- **"Why do you need that?"**

### Hold
- **"Put the call on hold."** / **"One moment."** / **"Please hold."**

### Resume
- **"Thank you for waiting. Are you there?"** / **"I'm back."** / **"Thanks for waiting on hold."**

### Goodbye
- **"Thank you."** / **"That's all."** / **"Goodbye."**

---

## 4. Suggested Test Runs

**Run 1 – Happy path only**  
Use Section 1 script from top to bottom. Goal: all four fields collected and call ends cleanly.

**Run 2 – Identity + patient + confirmations**  
Do Section 2a and 2b. After each EVA answer that ends with "Is the value correct?" or "Are we good?", say **"We're good."** or **"Yes."** before giving the next value. Goal: two-step flow (answer → confirm → next field).

**Run 3 – Cross-questioning**  
In the middle of giving values, ask: **"What did I say for deductible?"** then **"We're good."** Then **"Can you repeat the question?"** then **"Eighty dollars."** Then **"Update copay to twenty dollars."** Goal: recall, repeat, and correction all work.

**Run 4 – Hold and resume**  
After EVA asks for copay, say **"One moment please."** Wait ~5 seconds, then **"Thank you for waiting. Are you there?"** Then give copay (e.g. **"Ninety dollars."**). Goal: hold detected, resume detected, flow continues with correct field.

**Run 5 – Full flow**  
Combine: greeting → patient name → DOB → confirmations → what do you need → give all four fields (with one hold/resume and one "what did I say for deductible?") → thank you. Goal: one call that touches all capabilities.

---

## 5. Chunking & Performance (Why EVA Responds Fast)

**What chunking does:**  
- **TTS (voice out):** EVA sends your reply to ElevenLabs in *streaming* mode so the first part of the sentence plays as soon as it's ready (faster time-to-first-word).  
- **STT (listening):** We use smaller audio chunks and process more often (~2 s min, ~8 s max, 4 s fallback) so we send your speech to transcription sooner. Before chunking: ~4 s min, ~15 s max, 6 s fallback.

**Why the gain can feel small:** Most delay is from **external APIs** (ElevenLabs STT/TTS, Gemini). Chunking only reduces wait on our side. Use clear phrases from this doc so transcription and AI get it right the first time.

---

## 6. Failure Handling (No Going Back)

If something fails (transcription, AI, or a glitch), EVA says: **"Sorry, I didn't get that. Can you tell me the [current field] again?"** She asks **only** for the current field; she does **not** go back or re-ask earlier questions. Collected data is kept — repeat the current value and the flow continues from there.

---

*Phrases in this document are aligned with EVA’s prompts and media-stream handlers for reliable recognition.*
