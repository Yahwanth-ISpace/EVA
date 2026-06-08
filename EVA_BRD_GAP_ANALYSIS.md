# EVA vs BRD Gap Analysis

**BRD source:** `BRD Eligibility verification document- SVA.docx` (Sabrina Voice Agent, v1.1, draft)  
**Compared to:** Current EVA codebase (Reena / Went Dentals media-stream agent)  
**Date:** June 4, 2026  
**Purpose:** Phase 1 pilot readiness assessment for UHC existing-plan benefit verification

---

## Executive Summary

EVA has a **strong voice-agent core** (outbound calling, generic TPA IVR navigation, live-rep conversation, identity Q&A, configurable benefit questions, transcript capture). It can execute end-to-end calls today when fed appointment data via Mongo/scheduler.

**Phase 1 BRD is not fully fulfilled.** The largest gaps are **production Sabrina integration** (API read/write + call status), **call-level retry and exception routing**, **UHC-specific IVR**, **full Phase 1 field validation** (25 existing-plan fields), and **operational statuses** (Not Provided, Incomplete, patient not found / not eligible).

| Status | Count | Meaning |
|--------|------:|---------|
| **Met** | 11 | Implemented and usable for pilot with caveats |
| **Partial** | 9 | Started but incomplete vs BRD |
| **Gap** | 8 | Not implemented; required for BRD compliance |
| **N/A (Sabrina-owned)** | 4 | BRD assigns to Sabrina platform, not EVA |

**Estimated effort to close EVA-side gaps:** **~12–16 weeks** (one team, assuming Sabrina API specs and UHC IVR test access are available). Parallel work on Sabrina API can reduce calendar time.

---

## Scope Clarification

The BRD names the agent **Sabrina Verification Agent** integrated with **Sabrina** (system of record). Current build is **EVA**, with Sabrina-shaped data in **Mongo** and results in **Prisma Verification** — not live Sabrina HTTP APIs.

Items explicitly **out of EVA scope** per BRD (Sabrina / ops platform):
- BCP file ingestion into Sabrina
- Dental Exchange eligibility pre-check before calling
- Existing-plan vs new-plan **decision logic** (Sabrina compares captured data to plan catalog)
- New-plan full benefit capture (Phase 1 out of scope)

---

## Requirements Traceability Matrix

| ID | BRD Requirement | Status | EVA Today | Gap / Notes | Dependecy |
|----|-------------------|--------|-----------|-------------|------------|
| R1 | Outbound AI calling channel for dental benefit verification | **Met** | Twilio outbound + media-stream WebSocket | — |
| R2 | Navigate payer IVR to reach rep or benefits | **Partial** | Generic `tpa-ivr` mode (speech + DTMF member ID/DOB) | Not UHC-specific; needs payer-tuned scripts |
| R3 | Respond to verification questions during call | **Met** | Guardrails + Gemini + identity cheat-sheet | — |
| R4 | Provide auth: NPI, TIN, member ID | **Met** | `resolveIdentityDirectReply()` from call context | — |
| R5 | Structured benefit collection with live agents | **Met** | TPA-led Q&A gate, verbatim questions, field order | — |
| R6 | Capture Phase 1 **existing plan** field set (~25 fields) | **Partial** | Full schema in `sample.json` + scheduler transform | Runtime defaults to 4 legacy fields; validation not schema-wide |
| R7 | Six mandatory fields (Preventive/Basic/Major %, Yearly Max $, Ind/Family Deductible $) | **Partial** | Defined in sample JSON as `Preventive(D0120)`, etc. | Only collected when full `verificationFields` loaded; no special “mandatory six” logic |
| R8 | Schema-driven agent — add/remove fields without code change | **Partial** | Dynamic `verificationSteps` from appointment | Validation/normalization still hardcoded for coverage/deductible/copay/validity |
| R9 | Convert captured data to required Sabrina format | **Partial** | `mapSubrinaAnswers()` maps to Sabrina-shaped Mongo doc | No production API payload contract / field mapping sign-off |
| R10 | Write results + call status back to **Sabrina via API** | **Gap** | Saves to Prisma `Verification` + Mongo `sabrina_response` (debug) | No Sabrina HTTP client, status codes, or writeback on completion | EVA Team |
| R11 | Read case context from **Sabrina via API** | **Partial** | Mongo `appointments` / `sabrina_appointments`; `POST /appointments` accepts Sabrina payload | No inbound Sabrina webhook/API for case initiation |
| R12 | Call complete when all existing-plan fields captured | **Partial** | EVA ends call when all fields in **its** ordered list are filled | List may be 4 fields, not 25; completion not synced to Sabrina |
| R13 | **Retry policy:** max 2 attempts on call drop after connecting to rep | **Gap** | In-call validation retry only | No case-level attempt counter or requeue | Sabrina |
| R14 | Patient not found/Missing/ambiguous values: Not Provided, Not Found | **Gap** | Asks to repeat; no structured sentinels | Schema + extraction + writeback | EVA Team |
| R15 | Member not eligible on DOS → status to Sabrina | **Gap** | Not implemented | Phrase detection + status writeback | Sabrina |
| R16 | Exceptions routed to Sabrina / ops for review | **Gap** | Local save only | Status API + exception queue contract | Sabrina |
| R17 | Pilot limited to **UHC** | **Partial** | Sample data references United Healthcare | No UHC-only routing or IVR profile |
| R18 | Existing vs new plan routing | **N/A** | — | Sabrina business logic post-writeback |
| R19 | New plan capture | **N/A** | Out of scope Phase 1 | — |
| R20 | Automated scheduling / case queue from Sabrina | **Partial** | `SchedulerService` on startup + manual `GET /scheduler/appointment` | Cron disabled; sample API not Sabrina queue |

---

## What Is Already Built (Strengths)

These align well with BRD intent and reduce remaining work:

1. **Real-time voice loop** — STT → Gemini + guardrails → ElevenLabs TTS over Twilio media stream.
2. **Generic TPA IVR navigation** — provider yes, eligibility benefits, representative, member ID/DOB DTMF, handoff to live rep.
3. **Identity verification answers** — patient/subscriber name & DOB, member ID, NPI, billing NPI, tax ID, provider name, NATO spelling.
4. **TPA-led benefit Q&A** — EVA waits until rep opens questions before asking benefit fields.
5. **Configurable field list** — `verificationFields` / `verificationSteps` from appointment (scheduler transforms all 25+ fields including procedure history).
6. **Verbatim questions** — spoken from appointment payload, not improvised.
7. **Hold / resume**, recall, corrections, two-step call closing.
8. **Transcript + extracted data persistence** — Prisma verification record, bot tracker, client UI.
9. **Sabrina-shaped data model** — appointment DTO, Mongo collections, answer mapping for writeback shape.

---

## Gap Detail & Build Timeline

Estimates assume: 1 backend + 1 voice/QA engineer, Sabrina API spec available within sprint 1, UHC test line/recordings for IVR tuning.

### Priority 0 — Pilot blockers

| Gap | Description | Deliverables | Est. |
|-----|-------------|--------------|-----:|
| **G1** | **Sabrina API integration (read + write)** | REST client; read initiation payload; POST captured fields + call status (`Completed` / `Incomplete` / exception codes); auth; retries; map to approved JSON schema | **3–4 wks** |
| **G2** | **Production case initiation from Sabrina** | Webhook or poll endpoint; replace sample-data scheduler path; pass `AppointmentID`, field schema, phone, context into outbound call | **1–2 wks** |
| **G3** | **Call-level retry policy** | Attempt counter per case; detect drop after live connect; max 2 retries (configurable); schedule retry; report attempt status to Sabrina | **1–2 wks** |
| **G4** | **Completion & exception statuses** | Structured outcomes: complete, incomplete (missing fields), API write failure, call failed, patient not found, not eligible; notes field; Sabrina writeback on all terminal states | **2 wks** |

**Subtotal P0:** **7–10 weeks**

---

### Priority 1 — Phase 1 field & payer completeness

| Gap | Description | Deliverables | Est. |
|-----|-------------|--------------|-----:|
| **G5** | **Full Phase 1 field set (25 fields) on every call** | Ensure all calls use Sabrina/appointment schema (no 4-field fallback in production); include history/procedure fields; end-call only when full set done or explicitly marked N/A | **1–2 wks** |
| **G6** | **Schema-driven validation (true schema-driven)** | Field type in schema (`percent`, `dollar`, `date`, `text`, `history`); generic validator; remove hardcoded 4-field logic in `validateAndNormalizeBenefitExtracted` | **2–3 wks** |
| **G7** | **Missing value sentinels** | Support `Not Provided`, `Unknown`, `Not Applicable` per field; rep-refusal phrases; store and write back to Sabrina | **1 wk** |
| **G8** | **UHC-specific IVR profile** | Payer config for UnitedHealthcare: phrase sets, menu paths, DTMF timing, survey/hold handling; feature flag `payer=uhc` | **2–3 wks** |
| **G9** | **Date of service in authentication** | Load DOS from appointment; answer when rep asks; optional IVR DTMF if UHC prompts for service date | **3–5 days** |

**Subtotal P1:** **6–9 weeks** (partial overlap with P0)

---

### Priority 2 — Operations & hardening

| Gap | Description | Deliverables | Est. |
|-----|-------------|--------------|-----:|
| **G10** | **Patient not found / not eligible handling** | Detect rep phrases; stop benefit collection; set Sabrina status; optional early hang-up with message | **1 wk** |
| **G11** | **Scheduler / queue automation** | Enable cron or Sabrina-driven worker; agent pool / concurrency; US timezone scheduling | **1–2 wks** |
| **G12** | **Operations field mapping sign-off** | Import approved field list + question mapping from ops; JSON schema tests per sample file (BRD open item) | **1 wk** (joint with ops) |
| **G13** | **UAT & payer certification** | Test matrix for UHC happy path, IVR, partial capture, retries, writeback failures | **2 wks** |

**Subtotal P2:** **5–6 weeks**

---

## Recommended Delivery Timeline

Assuming start **Week 1** with Sabrina API access in parallel:

| Phase | Weeks | Focus | Exit criteria |
|-------|------:|-------|---------------|
| **Phase A — Integration foundation** | 1–4 | G1, G2, G9 | Sabrina sends case → EVA calls → writes status + partial data back |
| **Phase B — Reliability & statuses** | 3–6 | G3, G4, G7, G10 | Retries, incomplete/exception statuses, sentinel values |
| **Phase C — Full field set & schema** | 5–8 | G5, G6, G12 | All 25 fields captured with schema validation; ops-approved mapping |
| **Phase D — UHC pilot** | 7–10 | G8, G11, G13 | UHC IVR certified; automated queue; UAT sign-off |
| **Phase E — Pilot launch buffer** | 11–12 | Bug fixes, monitoring, runbooks | Production pilot with Sabrina ops |

**Target pilot-ready (EVA-side):** ~**10–12 weeks**  
**Target BRD Phase 1 fully compliant (EVA + Sabrina):** ~**12–16 weeks** (includes Sabrina team API + plan-routing work)

---

## Dependencies & Open Items (from BRD)

| Dependency | Owner | Impact if delayed |
|------------|-------|-------------------|
| Sabrina API spec (read case, write results, status enums) | Sabrina team (Natraj) | Blocks G1, G2, G4 |
| Approved Phase 1 field list + question mapping | Operations (Vamshi) | Blocks G5, G6, G12 |
| Sabrina validation rules for missing data | Sabrina + Ops | Blocks G7, G14 |
| UHC IVR test environment / recordings | Ops / QA | Blocks G8 |
| JSON format testing per sample appointment | QA + Dev | Blocks UAT |
| Dental Exchange pre-check before call | Sabrina | EVA only receives cases Sabrina assigns |

---

## Risk Summary

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sabrina API not ready | High | Define contract early; stub API; continue Mongo bridge for dev |
| UHC IVR changes frequently | Medium | Payer config files, not hardcoded handler logic |
| 25-field calls too long / rep hang-up | Medium | Sentinel values; mandatory-vs-optional flags in schema |
| Schema-driven validation underestimated | Medium | Phase C dedicated sprint; start with 6 mandatory fields |
| Agent name mismatch (Sabrina vs Reena/EVA) | Low | Branding/config only; no functional impact |

---

## Summary Scorecard

| BRD theme | Fulfillment |
|-----------|-------------|
| Voice agent conversation | **~85%** |
| IVR navigation | **~55%** (generic yes; UHC no) |
| Phase 1 field capture | **~50%** (schema exists; production path incomplete) |
| Sabrina integration | **~25%** (Mongo shape only) |
| Retry & exception handling | **~10%** |
| Pilot operations (queue, retry, status) | **~30%** |

**Bottom line:** EVA is a capable **Phase 1 prototype** for voice verification. To meet the BRD for UHC pilot, prioritize **Sabrina API integration**, **call retry/status model**, **full 25-field schema path**, and **UHC IVR profile** in that order.

---

## Related EVA Docs

- `EVA_CALL_AGENT_INTERNAL.md` — current agent capabilities
- `EVA_QA_TEST_CHECKLIST.md` — QA scenarios
- `CALL_FLOW_AND_AI.md` — technical call flow
- `IVR_SETUP.md` — TPA IVR mode setup
- `apps/backend/src/schedular/sample.json` — Phase 1 field schema reference
