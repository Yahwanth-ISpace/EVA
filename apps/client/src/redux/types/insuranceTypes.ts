import type { Payee } from "./payeeTypes";

export interface InsuranceRecord {
  id: string;
  payeeId: string;
  coverage: string;
  deductible: string;
  copay: string;
  validity: string;
  transcript: string;
  createdAt: string;
  payee: Payee;
}
