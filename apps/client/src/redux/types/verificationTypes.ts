import type { Payee } from "./payeeTypes";

//Action Types
export const CREATE_VERIFICATION_REQUEST = "CREATE_VERIFICATION_REQUEST";
export const CREATE_VERIFICATION_SUCCESS = "CREATE_VERIFICATION_SUCCESS";
export const CREATE_VERIFICATION_FAILURE = "CREATE_VERIFICATION_FAILURE";

export const FETCH_VERIFICATIONS_REQUEST = "FETCH_VERIFICATIONS_REQUEST";
export const FETCH_VERIFICATIONS_SUCCESS = "FETCH_VERIFICATIONS_SUCCESS";
export const FETCH_VERIFICATIONS_FAILURE = "FETCH_VERIFICATIONS_FAILURE";

export const FETCH_VERIFICATION_BY_ID_REQUEST =
  "FETCH_VERIFICATION_BY_ID_REQUEST";
export const FETCH_VERIFICATION_BY_ID_SUCCESS =
  "FETCH_VERIFICATION_BY_ID_SUCCESS";
export const FETCH_VERIFICATION_BY_ID_FAILURE =
  "FETCH_VERIFICATION_BY_ID_FAILURE";

export const SUBMIT_VERIFICATION_REQUEST = "SUBMIT_VERIFICATION_REQUEST";
export const SUBMIT_VERIFICATION_SUCCESS = "SUBMIT_VERIFICATION_SUCCESS";
export const SUBMIT_VERIFICATION_FAILURE = "SUBMIT_VERIFICATION_FAILURE";

export const DELETE_VERIFICATION_REQUEST = "DELETE_VERIFICATION_REQUEST";
export const DELETE_VERIFICATION_SUCCESS = "DELETE_VERIFICATION_SUCCESS";
export const DELETE_VERIFICATION_FAILURE = "DELETE_VERIFICATION_FAILURE";

/** Subset of verification requirement returned with verification list/detail. */
export interface VerificationRequirementRef {
  id: string;
  verificationFields?: unknown;
}

export interface VerificationRecord {
  id: string;
  payee: Payee;
  payeeId?: string;
  transcript: string;
  createdAt?: string;
  extractedData?: Record<string, string | null> | null;
  verificationRequirementId?: string | null;
  verificationRequirement?: VerificationRequirementRef | null;
  /** Legacy API shape; prefer extractedData from backend. */
  coverage?: string;
  copay?: string;
  deductible?: string;
  validity?: string;
}
