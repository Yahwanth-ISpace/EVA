# EVA Call Agent — Internal One-Pager

**Agent:** Reena from Went Dentals (EVA)  
**Purpose:** Outbound insurance benefit verification for dental patients  
**Audience:** Product, engineering, ops, QA

---

## Call Flow (30-second view)

1. Call connects → EVA waits for **live TPA rep** to speak first (or navigates payer IVR in `tpa-ivr` mode).
2. EVA introduces herself **once**, states purpose **once** when asked.
3. Rep leads **identity verification** → EVA answers from pre-loaded appointment data.
4. Rep opens benefit Q&A → EVA asks **verbatim configured questions** in order.
5. Values validated & stored → two-step close → transcript + data saved to verification record.

**Default fields:** coverage (%), deductible ($), copay ($ or %), validity (date). Configurable per appointment.

---

## What EVA Can Do

| Area             | Behavior                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opening**      | Adapts to hi/hello, how-are-you, good morning/evening, or long rep intro. Does not echo rep's name. No mid-call re-intro.                                             |
| **Identity**     | Answers patient/subscriber name, DOB, member ID, NPI, tax ID, provider name from DB. Spells names via NATO phonetics on request. Never volunteers name/DOB upfront.   |
| **Benefits**     | Asks one field at a time in configured order. Uses exact appointment questions. Acknowledges + next field after each value. Supports multi-value answers in one turn. |
| **Audio issues** | Re-asks **current field only** when inaudible. Stays silent on noise/ring STT artifacts. Validates type (%, $, date) and politely re-prompts on mismatch.             |
| **Hold**         | Holds on "one moment / please hold / let me check." Resumes on "I'm back / thanks for waiting." Max hold: **9 min**.                                                  |
| **Recall**       | Answers "what is the deductible?" from **stored values** — never guesses.                                                                                             |
| **Close**        | Step 1: _"That's all I have. Thank you for your help."_ Step 2 (after rep thanks): _"You're welcome. Have a wonderful day."_                                          |

---

## Intelligence Stack

| Component              | Role                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Gemini (LLM)**       | Flexible replies + benefit extraction                                               |
| **Guardrails (code)**  | Openings, hold, identity, recall, benefit gating, field order — many turns skip LLM |
| **Pre-loaded context** | Patient, subscriber, payer, provider, member ID, verbatim questions                 |
| **STT → LLM → TTS**    | ElevenLabs/Whisper transcription, ElevenLabs voice, silence-based turn detection    |
| **Validation**         | Normalizes `$`, `%`, dates; rejects wrong types and invented validity               |

---

## Intentional Limits (Why)

| Limit                                    | Reason                                                               |
| ---------------------------------------- | -------------------------------------------------------------------- |
| No benefit questions until rep opens Q&A | Matches real insurance call etiquette; avoids sounding pushy/robotic |
| Purpose & intro said once only           | Prevents LLM "bot drift" (repeating _"I'm calling to verify…"_)      |
| Verbatim benefit questions only          | Office/payer-specific wording; compliance & consistency              |
| Fixed field order                        | Nothing skipped; predictable data collection                         |
| No invented values/dates                 | Bad data in verification records                                     |
| English only                             | STT/LLM tuned for US English calls                                   |
| Won't admit being AI                     | Rep engagement; framed as office representative                      |
| Silent on short noise                    | Avoids talking over rep or false re-asks                             |
| Hold cap 9 min                           | Prevents abandoned calls blocking lines; partial data still saved    |

---

## Modes

- **`eva` (default):** Live rep conversation after connect.
- **`tpa-ivr`:** Scripted payer IVR → DTMF member ID/DOB → handoff to live rep → `eva` flow.

---

## EVA Workflow (End-to-End Architecture)

The following workflow explains how EVA operates from the moment appointments are available until the insurance verification results are returned. This is intended to be understandable even for someone who is new to the system.

### Step 1 – Pull Appointments from Sabrina

- EVA periodically connects to the **Sabrina** system.
- It fetches all appointments that are scheduled and eligible for insurance verification.
- Each appointment contains patient, subscriber, provider, insurance, and office information required for the verification call.

↓

### Step 2 – Format Appointment for EVA

- The appointment data received from Sabrina is converted into EVA's internal format.
- All required information is standardized and prepared for the AI call agent.
- This includes:
  - Patient information
  - Subscriber information
  - Insurance company details
  - Provider information
  - Office information
  - Member ID
  - DOB
  - NPI
  - Tax ID
  - Other required identifiers

↓

### Step 3 – Determine Fields to Collect

- EVA identifies which insurance benefit fields need to be collected for the appointment.
- These fields are configurable and may vary by office or insurance plan.
- Examples include:
  - Coverage Percentage
  - Deductible
  - Copay
  - Effective / Validity Date
  - Remaining Benefits
  - Frequency Limitations
  - Waiting Period
  - Any other configured verification questions

↓

### Step 4 – Call the TPA and Collect Information

- EVA initiates the outbound call to the insurance company (TPA).
- If required, EVA first navigates the payer IVR.
- Once connected to a live representative:
  - Identity verification questions are answered using the appointment data.
  - EVA asks every configured benefit question in the defined order.
  - Responses are validated and stored.
  - The entire conversation is transcribed.
  - Structured insurance benefit data is extracted from the conversation.

↓

### Step 5 – Send Verification Results Back to Sabrina

- Once the call is completed, EVA prepares the verification result.
- The response includes:
  - All collected insurance benefit fields
  - Verification status
  - Call transcript
  - Metadata about the verification

- This information is sent back to Sabrina so that the verified benefits are available to the office staff.

---

## Important EVA APIs

### 1. Scheduler API (Call Trigger API)

#### Purpose

This is the primary API responsible for starting the EVA verification workflow.

#### What it does

1. Retrieves appointments from Sabrina.
2. Filters appointments that are eligible for verification.
3. Converts the appointment into EVA's internal format.
4. Determines the fields that must be collected.
5. Creates the verification job.
6. Initiates the outbound call to the insurance company.
7. Tracks the call until completion.

In short, this API acts as the entry point of the entire EVA verification process.

---

### 2. Verification Result API

#### Purpose

This API provides the final verification results after the call has completed.

#### Response includes

- Verification status
- All insurance benefit fields collected during the call
- Complete call transcript
- Extracted structured insurance information
- Call metadata
- Verification timestamps

This API is used by Sabrina (or any downstream consumer) to retrieve the completed insurance verification information generated by EVA.

---

## Key Env / Tunables

`EVA_ANSWER_WINDOW_MS` · `EVA_SILENCE_*` · `POST_DOB_LONG_SILENCE_NUDGE_MS` · `HOLD_MAX_MS` (9 min) · `EVA_ABORT_CALL_ON_NOISE` (default off)

**Related docs:** `CALL_FLOW_AND_AI.md` · `EVA_TEST_SCRIPTS.md` · `EVA_QA_TEST_CHECKLIST.md` · `IVR_SETUP.md`
