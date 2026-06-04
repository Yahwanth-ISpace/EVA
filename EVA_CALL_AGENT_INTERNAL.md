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

| Area | Behavior |
|------|----------|
| **Opening** | Adapts to hi/hello, how-are-you, good morning/evening, or long rep intro. Does not echo rep's name. No mid-call re-intro. |
| **Identity** | Answers patient/subscriber name, DOB, member ID, NPI, tax ID, provider name from DB. Spells names via NATO phonetics on request. Never volunteers name/DOB upfront. |
| **Benefits** | Asks one field at a time in configured order. Uses exact appointment questions. Acknowledges + next field after each value. Supports multi-value answers in one turn. |
| **Audio issues** | Re-asks **current field only** when inaudible. Stays silent on noise/ring STT artifacts. Validates type (%, $, date) and politely re-prompts on mismatch. |
| **Hold** | Holds on "one moment / please hold / let me check." Resumes on "I'm back / thanks for waiting." Max hold: **9 min**. |
| **Recall** | Answers "what is the deductible?" from **stored values** — never guesses. |
| **Close** | Step 1: *"That's all I have. Thank you for your help."* Step 2 (after rep thanks): *"You're welcome. Have a wonderful day."* |

---

## Intelligence Stack

| Component | Role |
|-----------|------|
| **Gemini (LLM)** | Flexible replies + benefit extraction |
| **Guardrails (code)** | Openings, hold, identity, recall, benefit gating, field order — many turns skip LLM |
| **Pre-loaded context** | Patient, subscriber, payer, provider, member ID, verbatim questions |
| **STT → LLM → TTS** | ElevenLabs/Whisper transcription, ElevenLabs voice, silence-based turn detection |
| **Validation** | Normalizes `$`, `%`, dates; rejects wrong types and invented validity |

---

## Intentional Limits (Why)

| Limit | Reason |
|-------|--------|
| No benefit questions until rep opens Q&A | Matches real insurance call etiquette; avoids sounding pushy/robotic |
| Purpose & intro said once only | Prevents LLM "bot drift" (repeating *"I'm calling to verify…"*) |
| Verbatim benefit questions only | Office/payer-specific wording; compliance & consistency |
| Fixed field order | Nothing skipped; predictable data collection |
| No invented values/dates | Bad data in verification records |
| English only | STT/LLM tuned for US English calls |
| Won't admit being AI | Rep engagement; framed as office representative |
| Silent on short noise | Avoids talking over rep or false re-asks |
| Hold cap 9 min | Prevents abandoned calls blocking lines; partial data still saved |

---

## Modes

- **`eva` (default):** Live rep conversation after connect.
- **`tpa-ivr`:** Scripted payer IVR → DTMF member ID/DOB → handoff to live rep → `eva` flow.

---

## Key Env / Tunables

`EVA_ANSWER_WINDOW_MS` · `EVA_SILENCE_*` · `POST_DOB_LONG_SILENCE_NUDGE_MS` · `HOLD_MAX_MS` (9 min) · `EVA_ABORT_CALL_ON_NOISE` (default off)

**Related docs:** `CALL_FLOW_AND_AI.md` · `EVA_TEST_SCRIPTS.md` · `EVA_QA_TEST_CHECKLIST.md` · `IVR_SETUP.md`
