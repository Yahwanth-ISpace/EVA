import type {
  PatientCallContext,
  PatientVerificationStep,
} from '../../verification/verification.service';
import { verbatimBenefitQuestion } from './guardrails';
import type { StreamState } from './stream-state';

/** Copy verification steps from appointment context onto stream state. */
export function applyVerificationStepsToStreamState(
  state: StreamState,
  ctx: PatientCallContext,
): void {
  const steps = ctx.verificationSteps ?? [];
  if (!steps.length) return;

  state.fieldQuestionByKey = Object.fromEntries(
    steps
      .filter((s) => s.field)
      .map((s) => [
        s.field,
        s.question?.trim() || verbatimBenefitQuestion(s.field, {}),
      ]),
  );

  state.verificationStepByField = Object.fromEntries(
    steps.filter((s) => s.field).map((s) => [s.field, s]),
  );

  state.verificationStepByProcedureCode = Object.fromEntries(
    steps.filter((s) => s.procedureCode).map((s) => [s.procedureCode!, s]),
  );
}
