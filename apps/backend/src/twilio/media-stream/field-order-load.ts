import type { VerificationRequirementService } from '../../verification-requirement/verification-requirement.service';
import { verbatimBenefitQuestion } from './guardrails';
import type { StreamState } from './stream-state';

/**
 * Loads ordered benefit field keys and verbatim question text once per call:
 * prefers Mongo appointment `verificationSteps`, otherwise Prisma verification requirement.
 */
export async function loadBenefitFieldOrderIfNeeded(
  state: StreamState,
  deps: {
    ensurePatientCallContext: () => Promise<void>;
    verificationRequirementService: VerificationRequirementService;
    warn: (message: string, detail?: string) => void;
  },
): Promise<void> {
  if (!state.patientId || state.orderedFields.length > 0) return;
  try {
    await deps.ensurePatientCallContext();
    const steps = state.callContext?.verificationSteps;
    if (steps && steps.length > 0) {
      state.orderedFields = steps
        .slice()
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        .map((s) => s.field)
        .filter(Boolean);
      state.fieldQuestionByKey = Object.fromEntries(
        steps.map((s) => [
          s.field,
          s.question?.trim() || verbatimBenefitQuestion(s.field, {}),
        ]),
      );
      state.verificationRequirementId = null;
    } else {
      const entries =
        await deps.verificationRequirementService.getOrderedFieldsForPayee(
          state.patientId,
          null,
        );
      state.orderedFields = entries.map((e) => e.field);
      state.fieldQuestionByKey = {};
      for (const e of entries) {
        state.fieldQuestionByKey[e.field] =
          e.question?.trim() || verbatimBenefitQuestion(e.field, {});
      }
      const { requirementId } =
        await deps.verificationRequirementService.getOrderedFieldsAndRequirementId(
          state.patientId,
        );
      state.verificationRequirementId = requirementId;
    }
  } catch (e: any) {
    deps.warn(
      '[MediaStream] Failed to load verification fields, using defaults',
      e?.message,
    );
    state.orderedFields = ['coverage', 'deductible', 'copay', 'validity'];
    state.fieldQuestionByKey = {};
    for (const f of state.orderedFields) {
      state.fieldQuestionByKey[f] = verbatimBenefitQuestion(f, {});
    }
    state.verificationRequirementId = null;
  }
}
