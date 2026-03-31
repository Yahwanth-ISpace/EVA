import type { Payee } from "./payeeTypes";
import type { VerificationRequirementRef } from "./verificationTypes";

export interface InsuranceRecord {
  id: string;
  payeeId: string;
  transcript: string;
  createdAt: string;
  payee: Payee;
  extractedData?: Record<string, string | null> | null;
  verificationRequirementId?: string | null;
  verificationRequirement?: VerificationRequirementRef | null;
  coverage?: string;
  deductible?: string;
  copay?: string;
  validity?: string;
}
