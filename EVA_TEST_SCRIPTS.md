# EVA Test Scripts – User Scripts for Accurate Responses

Use these **exact or close phrases** so EVA (Reena) understands quickly. Speak clearly and wait for EVA to finish before you talk.

---

## 1. Happy Path (Smooth Flow)

**Goal:** Collect all four benefit fields; EVA confirms after each value; call ends only when you say thank you.

| Step | You (user) say | What EVA does |
|------|----------------|---------------|
| 1 | EVA says: *"Hi, I'm Reena from Went Dentals. How are you doing?"* | — |
| 2 | **"I'm doing great, how can I help you?"** | Says she wants to verify benefits of a patient. |
| 3 | **"What do you need?"** or **"What details do you need?"** | Asks for first field (e.g. coverage). |
| 4 | **"Eighty percent."** (or **"Coverage is eighty percent."**) | Notes it, then asks **"Is it okay?"** or **"Is that all you have?"** or **"Are we good?"** (one at random). |
| 5 | **"Yes."** or **"Thank you."** | Says thanks, asks for deductible. |
| 6 | **"Eighty dollars."** (for deductible) | Notes it, then one of the confirmation phrases above. |
| 7 | **"Yes."** / **"Thank you."** | Asks for copay. |
| 8 | **"Ninety dollars."** (for copay) | Notes it, then confirmation phrase. |
| 9 | **"Yes."** / **"Thank you."** | Asks for validity. |
| 10 | **"December twenty-first, twenty twenty-eight."** (or **"Valid till December 2028."**) | Notes it, then confirmation phrase. |
| 11 | **"Thank you."** / **"That's all."** / **"We're good."** | EVA says closing (*"Thank you for confirming the details. That's all I have. Have a good day."*) and the call ends. |

**Stored values:** Dollars are stored with **$** (e.g. `$80`, `$90`). Percentages with **%** (e.g. `80%`).

**Short happy-path script (copy-paste):**
```
I'm doing great, how can I help you?
What do you need?
Eighty percent.
Yes.
Eighty dollars.
Yes.
Ninety dollars.
Yes.
December twenty-first, twenty twenty-eight.
Thank you.
```

---

## 2. Full Capabilities – Test All Features

### 2a. Greeting and identity

| Step | You say | EVA behavior |
|------|---------|--------------|
| 1 | (EVA greets) | — |
| 2 | **"I'm doing great, how can I help you?"** | "I want to verify the benefits of a patient." |
| 3 | **"What is the name of the patient?"** | Gives patient name from DB. Then one of **"Is it okay?"** / **"Is that all you have?"** / **"Are we good?"** |
| 4 | **"Yes."** / **"We're good."** | Asks for next info (e.g. coverage). |
| 5 | **"What is the date of birth of the patient?"** | Gives DOB, then confirmation phrase. |
| 6 | **"We're good."** | Asks for next field (e.g. "Can I get the coverage?"). |

### 2b. Giving benefit values

| Step | You say | EVA behavior |
|------|---------|---------------|
| 7 | **"What do you need?"** | Asks for first missing field (e.g. coverage). |
| 8 | **"Coverage is eighty percent."** | Notes it, then confirmation phrase. Values stored as **%** (e.g. `80%`). |
| 9 | **"Yes."** | Asks for deductible. |
| 10 | **"Deductible is one hundred dollars."** | Notes it, then confirmation phrase. Stored as **$** (e.g. `$100`). |
| 11 | **"Copay is ninety dollars."** or **"Copay is twenty-five percent."** | Notes it; stored as **$90** or **25%**. |
| 12 | **"Validity is December twenty-first, twenty twenty-eight."** | Closing, then end after you say thank you. |

### 2c. Confirmations (after EVA asks)

After EVA gives a value or answers a question, she will say **one of**:

- **"Is it okay?"**
- **"Is that all you have?"**
- **"Are we good?"**

Then you say one of:

- **"Yes."** / **"Yeah."** / **"Thank you."** / **"That's it."** / **"We're good."** / **"Correct."**

She will then say **"Thanks."** and ask for the next field (or end if all four are collected and you said thank you).

### 2d. Recall (what value did you get?)

EVA answers **from the stored values** (so the number is always correct). Use phrases like:

| What you want to test | You say |
|------------------------|--------|
| What is the deductible? | **"What is the deductible?"** / **"What is the deductible provided?"** / **"What did I say for deductible?"** |
| What do you have for copay? | **"What is the copay?"** / **"Do you have the copay?"** |
| Coverage / validity | **"What is the coverage?"** / **"What is the validity?"** |

EVA will reply with the **exact stored value**, e.g. *"I have the deductible as $500."* (using **$** for dollars and **%** for percentage), then ask **"Is it okay?"** or similar.

### 2e. Repeat, correct, why

| What you want to test | You say |
|------------------------|--------|
| Repeat the question | **"Can you repeat the question?"** / **"What was the question?"** |
| Confirm value | **"So you have deductible as five hundred dollars?"** / **"Confirm copay is ninety."** |
| Correct a value | **"Update the copay to twenty-five dollars."** / **"Actually deductible is fifty dollars not one hundred."** |
| Why do you need that? | **"Why do you need that?"** |

### 2f. Hold and resume

| Step | You say | EVA behavior |
|------|---------|--------------|
| — | **"Put the call on hold."** / **"One moment please."** / **"Please hold."** | "Sure, I'll hold. Take your time." — no processing until you resume. |
| (wait a few seconds) | **"Thank you for waiting. Are you there?"** / **"I'm back."** / **"Thanks for waiting on hold."** | "No problem, thank you for getting back. I'm on the call." — flow continues (e.g. give the value we were asking for). |

**Hold phrases EVA understands:**
- "Put the call on hold." / "Put me on hold."
- "One moment." / "Please hold." / "Please wait."
- "I'm putting the call on hold."

**Resume phrases EVA understands:**
- "I'm back." / "Thank you for waiting." / "Thanks for waiting on hold."
- "Are you there?" / "Are you still there?" / "Let's continue." / "Ready to continue."

### 2g. End of call (thank you / goodbye)

The call ends **only** when:

1. All four fields (coverage, deductible, copay, validity) are collected, **and**
2. You say **thank you** / **that's all** / **we're done** / **goodbye**.

| You say | EVA behavior |
|---------|---------------|
| **"Thank you."** / **"Thanks."** | Closing line, then call ends. |
| **"That's all."** / **"We're done."** / **"Goodbye."** / **"I'm good."** | Same. |

If you ask something **after** EVA has said goodbye, she will answer, then ask **"Is that all you have? Let me know when you're good."** — when you say **"Yes"** / **"Thank you"** the call ends.

---

## 3. Quick Reference – Phrases EVA Recognizes

### Greeting / flow
- **"I'm doing great, how can I help you?"**
- **"What do you need?"** / **"What details do you need?"** / **"What are the details you want to know?"**

### Patient / identity
- **"What is the name of the patient?"** / **"Patient name?"**
- **"What is the date of birth of the patient?"** / **"Date of birth?"** / **"DOB?"**
- **"Who are you?"** / **"Identify yourself."**

### Confirmations (after EVA asks "Is it okay?" / "Is that all you have?" / "Are we good?")
- **"Yes."** / **"Yeah."** / **"Thank you."** / **"That's it."** / **"We're good."** / **"Correct."**

### Benefit values (stored as **$** or **%**)
- Coverage: **"Eighty percent."** / **"Coverage is eighty percent."** → stored as `80%`
- Deductible: **"One hundred dollars."** / **"Deductible is five hundred dollars."** → stored as `$100`, `$500`
- Copay: **"Ninety dollars."** or **"Twenty-five percent."** → stored as `$90` or `25%`
- Validity: **"December twenty-first, twenty twenty-eight."** / **"Valid till December 2028."**

### Recall
- **"What is the deductible?"** / **"What is the deductible provided?"**
- **"What did I say for deductible?"** / **"Do you have the copay?"** / **"What is the coverage?"**

### Hold / resume
- Hold: **"Put the call on hold."** / **"One moment."** / **"Please hold."**
- Resume: **"Thank you for waiting. Are you there?"** / **"I'm back."**

### Goodbye (call ends only after you say one of these when all four are collected)
- **"Thank you."** / **"That's all."** / **"Goodbye."** / **"We're done."** / **"I'm good."**

---

## 4. Suggested Test Runs

**Run 1 – Happy path**  
Use Section 1 script. After each value, say **"Yes"** or **"Thank you"** when EVA asks **"Is it okay?"** / **"Is that all you have?"** / **"Are we good?"** Then say **"Thank you"** at the end. Goal: all four fields collected, values stored as **$** / **%**, call ends cleanly.

**Run 2 – Identity + patient + confirmations**  
Do Section 2a and 2b. After each EVA confirmation phrase, say **"We're good."** or **"Yes."** before the next value. Goal: two-step flow (answer → confirm → next field).

**Run 3 – Recall**  
Give deductible (e.g. **"Five hundred dollars."**), confirm, then ask **"What is the deductible provided?"** EVA should say *"I have the deductible as $500."* (correct stored value). Goal: recall uses **$** and is correct.

**Run 4 – Hold and resume**  
After EVA asks for copay, say **"One moment please."** Wait, then **"Thank you for waiting. Are you there?"** Then give copay. Goal: hold/resume and correct field.

**Run 5 – Full flow**  
Greeting → patient name → DOB → confirmations → give all four fields (with one hold/resume and one recall question) → thank you. Goal: one call that touches all capabilities.

---

## 5. Chunking & Performance

- **TTS:** EVA streams reply via ElevenLabs so the first part plays as soon as it’s ready.
- **STT:** We process audio in chunks (~2 s min, ~8 s max, 4 s fallback) so we send speech to transcription sooner.

Most delay is from external APIs (ElevenLabs, Gemini). Use clear phrases from this doc so transcription and AI get it right the first time.

---

## 6. Failure Handling

If something fails (transcription or a glitch), EVA may ask to repeat. She asks **only** for the **current** field; she does **not** go back or re-ask earlier questions. Collected data is kept — repeat the current value and the flow continues.

---

*Phrases in this document are aligned with EVA’s prompts and media-stream handlers for reliable recognition.*
