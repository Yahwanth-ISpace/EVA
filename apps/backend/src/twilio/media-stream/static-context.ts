import type { PatientCallContext } from '../../verification/verification.service';
import type { PatientInfo } from './stream-state';

/** Static patient data when no payee is loaded (for testing / inbound calls). */
export const STATIC_PATIENT_INFO: PatientInfo = {
  firstName: 'Sarah',
  lastName: 'Johnson',
  fullName: 'Sarah Johnson',
  dobFormatted: 'March 15, 1985',
  ssn: null,
};

/** Static call context used when no patient appointment is available (testing / inbound smoke tests).
 * Values here are only used as the final fallback so EVA still has something to say; real calls
 * get this data from `VerificationService.getPatientCallContext` at stream start. */
export const STATIC_CALL_CONTEXT: PatientCallContext = {
  patient: {
    firstName: STATIC_PATIENT_INFO.firstName,
    lastName: STATIC_PATIENT_INFO.lastName,
    fullName: STATIC_PATIENT_INFO.fullName,
    dob: null,
    dobFormatted: STATIC_PATIENT_INFO.dobFormatted,
    ssn: null,
  },
  subscriber: {
    firstName: STATIC_PATIENT_INFO.firstName,
    lastName: STATIC_PATIENT_INFO.lastName,
    fullName: STATIC_PATIENT_INFO.fullName,
    dobFormatted: STATIC_PATIENT_INFO.dobFormatted,
  },
  memberId: process.env.EVA_MEMBER_ID?.trim() || null,
  provider: null,
  office: null,
  payer: null,
  verificationSteps: [
    {
      field: 'coverage',
      question: 'What is the basic coverage?',
      order: 1,
    },
    {
      field: 'deductible',
      question: 'Can you provide the deductible?',
      order: 2,
    },
    { field: 'copay', question: 'What is the copay?', order: 3 },
    {
      field: 'validity',
      question: 'What is the validity of the insurance?',
      order: 4,
    },
  ],
};
