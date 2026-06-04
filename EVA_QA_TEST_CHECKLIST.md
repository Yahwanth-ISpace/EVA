# EVA QA Test Checklist

Use this checklist before release or after changes to media-stream, guardrails, or AI prompts.  
**Tester:** _______________ **Date:** _______________ **Build/Branch:** _______________

**Setup:** Valid appointment with patient context (name, DOB, member ID). Use a test TPA number or internal mock rep. Speak clearly; pause ~1s after each answer so STT captures the full utterance.

---

## 1. Call Connect & Opening

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 1.1 | EVA waits for rep to speak first (no premature intro over silence/IVR) | ☐ | ☐ | |
| 1.2 | Rep: *"Hi"* only → EVA replies warmly, **defers** full intro to next turn | ☐ | ☐ | |
| 1.3 | Rep: *"How are you?"* → EVA answers + introduces as Reena from Went Dentals | ☐ | ☐ | |
| 1.4 | Rep: *"Good morning"* → EVA mirrors greeting + intro | ☐ | ☐ | |
| 1.5 | Rep: long opener + *"How can I help?"* → EVA intro + purpose (*"I need a few benefit details of a patient"*) | ☐ | ☐ | |
| 1.6 | EVA does **not** echo rep's name (*"Hi John…"*) | ☐ | ☐ | |
| 1.7 | Purpose line said **once** — not repeated on later turns | ☐ | ☐ | |
| 1.8 | Mid-call *"Hello / are you there?"* → short continue line, **no** re-intro | ☐ | ☐ | |

---

## 2. Identity Verification (TPA-Led)

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 2.1 | EVA does **not** volunteer patient name/DOB on greeting alone | ☐ | ☐ | |
| 2.2 | *"What is the patient name?"* → correct name from records | ☐ | ☐ | |
| 2.3 | *"What is the date of birth?"* → correct DOB, no extra confirmation question | ☐ | ☐ | |
| 2.4 | *"Can you spell the name?"* → NATO phonetic spelling | ☐ | ☐ | |
| 2.5 | Member ID / NPI / tax ID / provider name → correct from context | ☐ | ☐ | |
| 2.6 | Missing field on file → *"I do not have that on my end…"* (no fabrication) | ☐ | ☐ | |
| 2.7 | After DOB, long silence (~45s) → **one** gentle nudge only | ☐ | ☐ | |

---

## 3. Benefit Q&A Gate

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 3.1 | Before rep opens Q&A, EVA does **not** ask coverage/deductible/copay/validity | ☐ | ☐ | |
| 3.2 | Rep: *"What do you need to know about the patient?"* → first benefit question (verbatim) | ☐ | ☐ | |
| 3.3 | Rep: *"I've located the patient, how can I help?"* → benefit Q&A opens | ☐ | ☐ | |
| 3.4 | First benefit ask may include *"I would need the [field]…"* prefix | ☐ | ☐ | |
| 3.5 | Questions match appointment-configured verbatim text | ☐ | ☐ | |

---

## 4. Benefit Collection

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 4.1 | Coverage *"Eighty percent"* → stored as `80%`, ack + next field | ☐ | ☐ | |
| 4.2 | Deductible *"Five hundred dollars"* → stored as `$500` | ☐ | ☐ | |
| 4.3 | Copay as dollars **or** percent → stored correctly | ☐ | ☐ | |
| 4.4 | Validity *"December 21st 2028"* → stored as normalized date | ☐ | ☐ | |
| 4.5 | Fields collected **in configured order** — none skipped | ☐ | ☐ | |
| 4.6 | Multi-value in one turn (e.g. coverage + deductible) → both captured | ☐ | ☐ | |
| 4.7 | Wrong type (dollars for validity) → polite re-ask with hint | ☐ | ☐ | |
| 4.8 | Already-collected field is **not** asked again | ☐ | ☐ | |

---

## 5. Recall, Repeat & Corrections

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 5.1 | *"What is the deductible?"* → exact stored value (*"I have the deductible as $500"*) | ☐ | ☐ | |
| 5.2 | *"Can you repeat the question?"* → verbatim current field question | ☐ | ☐ | |
| 5.3 | *"Actually deductible is $50 not $100"* → value updated | ☐ | ☐ | |
| 5.4 | *"So deductible is $500?"* → *"Yes, that's correct"* | ☐ | ☐ | |
| 5.5 | *"Why do you need that?"* → brief verification explanation | ☐ | ☐ | |

---

## 6. Hold & Resume

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 6.1 | *"One moment please"* → *"Sure, I'll hold. Take your time."* | ☐ | ☐ | |
| 6.2 | During hold, EVA does not process unrelated audio as answers | ☐ | ☐ | |
| 6.3 | *"Thank you for waiting, I'm back"* → resume ack, continues same field | ☐ | ☐ | |
| 6.4 | After hold + value given → value captured for correct field | ☐ | ☐ | |

---

## 7. Audio & Failure Handling

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 7.1 | Mumbled/empty audio → re-ask **current field** (not earlier fields) | ☐ | ☐ | |
| 7.2 | Short noise/ring → EVA stays silent (no false re-ask) | ☐ | ☐ | |
| 7.3 | Clear substantive answer not misclassified as *"didn't catch that"* | ☐ | ☐ | |
| 7.4 | Collected data **persists** after repeat/retry turns | ☐ | ☐ | |

---

## 8. Call Closing

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 8.1 | Last field collected → *"That's all I have. Thank you for your help."* (call **not** ended yet) | ☐ | ☐ | |
| 8.2 | Rep: *"Thank you"* → *"You're welcome. Have a wonderful day."* → call ends | ☐ | ☐ | |
| 8.3 | Rep says goodbye **before** all fields → EVA asks for missing field, does **not** hang up | ☐ | ☐ | |
| 8.4 | Post-goodbye rep says one more thing → brief reply, then ends | ☐ | ☐ | |
| 8.5 | Verification record saved with extracted data + transcript | ☐ | ☐ | |

---

## 9. Edge Cases & Persona

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 9.1 | *"Who is this?"* → short identity line, **not** full opening script | ☐ | ☐ | |
| 9.2 | *"Are you a bot / AI?"* → natural deflection, does **not** confirm AI | ☐ | ☐ | |
| 9.3 | Light small talk → brief reply, steers back to verification | ☐ | ☐ | |
| 9.4 | EVA does not say *"I'll hold"* unless rep asked to wait | ☐ | ☐ | |
| 9.5 | English only — no Spanish/other language replies | ☐ | ☐ | |

---

## 10. TPA IVR Mode (Optional — `navigateTpaIvr: true`)

| # | Test | Pass | Fail | Notes |
|---|------|:----:|:----:|-------|
| 10.1 | Navigates recording disclaimer / language prompts (silent where expected) | ☐ | ☐ | |
| 10.2 | Provider question → *"Yes"* | ☐ | ☐ | |
| 10.3 | Reason prompt → *"Eligibility Benefits"* | ☐ | ☐ | |
| 10.4 | Summary vs detail → *"Representative"* | ☐ | ☐ | |
| 10.5 | Member ID + DOB sent via DTMF from patient record | ☐ | ☐ | |
| 10.6 | Silent through routing/survey until live agent detected | ☐ | ☐ | |
| 10.7 | Handoff to live EVA conversation (Section 1–8) | ☐ | ☐ | |

---

## Quick Smoke Run (~5 min)

Minimum path to sign off a build:

1. Rep opens → EVA intro + purpose  
2. Rep asks patient name + DOB → correct answers  
3. Rep: *"What do you need?"* → all four fields collected  
4. One recall question mid-call  
5. One hold/resume  
6. Rep thank you → clean close  
7. Verify saved data in verification record  

**Smoke result:** ☐ Pass ☐ Fail

---

## Sign-Off

| Role | Name | Date | Result |
|------|------|------|--------|
| QA | | | ☐ Pass ☐ Fail |
| Engineering | | | ☐ Acknowledged |

**Blockers / defects:**

```
( list ticket IDs or describe failures )
```
