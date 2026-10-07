/**
 * Configurable keyword weights and handoff thresholds for IVR bypass detection.
 * Payer-specific rules can be appended via `TPA_IVR_EXTRA_KEYWORD_RULES_JSON` later.
 */

export type IvrKeywordRuleKind = 'ivr' | 'human';

export interface IvrKeywordRule {
  id: string;
  pattern: RegExp;
  weight: number;
  kind: IvrKeywordRuleKind;
}

/** Generic + payer-agnostic phrases (layer 1); complements `tpa-ivr.ts` matchers. */
export const DEFAULT_IVR_KEYWORD_RULES: IvrKeywordRule[] = [
  {
    id: 'menu_press',
    pattern: /press\s+\d|say or press|main menu|to repeat (this )?menu/i,
    weight: 22,
    kind: 'ivr',
  },
  {
    id: 'language_menu',
    pattern: /for english|for spanish|para español|presione/i,
    weight: 18,
    kind: 'ivr',
  },
  {
    id: 'hold_routing',
    pattern: /please hold|stay on the line|one moment|while (we|i) (connect|transfer)/i,
    weight: 16,
    kind: 'ivr',
  },
  {
    id: 'member_entry',
    pattern: /enter your (member|subscriber)|member id|identification number/i,
    weight: 20,
    kind: 'ivr',
  },
  {
    id: 'recorded',
    pattern: /this call (may be|will be|is) (recorded|monitored)|quality assurance/i,
    weight: 14,
    kind: 'ivr',
  },
  {
    id: 'human_help',
    pattern: /how can i help you( today)?|how may i help you( today)?|what can i assist you with/i,
    weight: 24,
    kind: 'human',
  },
  {
    id: 'human_may_i',
    pattern: /may i have (your|the)|can i get (your|the)|who am i speaking with/i,
    weight: 18,
    kind: 'human',
  },
  {
    id: 'human_intro',
    pattern: /\bmy name is\b|\bthis is\b.{0,35}\b(from|with)\b|\b(i am|i'm)\b.{0,25}\b(from|with)\b/i,
    weight: 20,
    kind: 'human',
  },
  {
    id: 'human_greet',
    pattern: /\b(hi|hello|good (morning|afternoon|evening))\b/i,
    weight: 10,
    kind: 'human',
  },
];

export function getIvrDetectionThresholds() {
  return {
    handoffHumanScore: Number(
      process.env.TPA_IVR_DETECTION_HANDOFF_HUMAN_SCORE || 72,
    ),
    handoffMaxIvrScore: Number(
      process.env.TPA_IVR_DETECTION_HANDOFF_MAX_IVR_SCORE || 38,
    ),
    handoffMultiSignalHumanScore: Number(
      process.env.TPA_IVR_DETECTION_MULTI_SIGNAL_HUMAN_SCORE || 58,
    ),
    handoffMultiSignalMinCount: Number(
      process.env.TPA_IVR_DETECTION_MULTI_SIGNAL_MIN || 2,
    ),
    llmMinConfidence: Number(
      process.env.TPA_IVR_DETECTION_LLM_MIN_CONFIDENCE || 0.72,
    ),
    llmCooldownMs: Number(
      process.env.TPA_IVR_DETECTION_LLM_COOLDOWN_MS || 9000,
    ),
    llmMaxPerCall: Number(process.env.TPA_IVR_DETECTION_LLM_MAX_PER_CALL || 4),
    scoreDecayPerTurn: Number(
      process.env.TPA_IVR_DETECTION_SCORE_DECAY || 4,
    ),
    llmEnabled: process.env.TPA_IVR_DETECTION_LLM_ENABLED !== 'false',
  };
}
