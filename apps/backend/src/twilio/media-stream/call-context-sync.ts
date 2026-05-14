import type { PatientCallContext } from '../../verification/verification.service';
import { verbatimBenefitQuestion } from './guardrails';
import type { StreamState } from './stream-state';

/** Copy verbatim benefit questions from loaded appointment context onto stream state. */
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
}
