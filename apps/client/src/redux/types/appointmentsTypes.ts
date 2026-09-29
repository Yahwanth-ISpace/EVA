import type { Office } from "./officeTypes";
import type { Payee } from "./payeeTypes";
import type { Provider } from "./providerTypes";

// Action Types
export type TicketStatus = "open" | "in-progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export const DELETE_APPOINTMENT_REQUEST = "DELETE_APPOINTMENT_REQUEST";
export const DELETE_APPOINTMENT_SUCCESS = "DELETE_APPOINTMENT_SUCCESS";
export const DELETE_APPOINTMENT_FAILURE = "DELETE_APPOINTMENT_FAILURE";

export const FETCH_APPOINTMENTS_REQUEST = "FETCH_APPOINTMENTS_REQUEST";
export const FETCH_APPOINTMENTS_SUCCESS = "FETCH_APPOINTMENTS_SUCCESS";
export const FETCH_APPOINTMENTS_FAILURE = "FETCH_APPOINTMENTS_FAILURE";

export const CREATE_APPOINTMENT_REQUEST = "CREATE_APPOINTMENT_REQUEST";
export const CREATE_APPOINTMENT_SUCCESS = "CREATE_APPOINTMENT_SUCCESS";
export const CREATE_APPOINTMENT_FAILURE = "CREATE_APPOINTMENT_FAILURE";

export type PatientInfo = {
  name: string;
  dob: string;
  providerId: string;
  officeId: string;
};

export type Appointment = {
  payeeId: string;
  name: string;
  dob: string;
  providerId: string;
  officeId: string;
  date: string;
  notes: string;
};

export type CreateAppointmentPayload = {
  date: string;
  notes: string;
  payeeId: string;
  providerId: string;
  officeId: string;
};

export type AppointmentBenefitInfoEntry = {
  question?: string;
  rule?: string;
  answer?: string | null;
  procedureCode?: string;
  procedurecode?: string;
  description?: string;
};

export type AppointmentVerificationFieldRef = {
  field: string;
  question?: string;
  rule?: string;
  order?: number;
  procedureCode?: string;
};

export interface AppointmentRecord {
  id: string;
  /** Sabrina / Mongo appointment id when present (used to match active calls). */
  appointmentId?: string | number;
  payeeId: string;
  patientId: string;
  providerId: string;
  officeId: string;
  date: string;
  /** When the appointment row was saved in Mongo (`savedAt`). */
  savedAt?: string;
  reason: string;
  status: "SCHEDULED" | "ERROR" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  notes: string;
  payee: Payee;
  provider: Provider;
  office: Office;
  /** Full application payload fields when returned from Mongo. */
  patient?: {
    patientId?: string;
    patientName?: string;
    patientDOB?: string;
    memberId?: string;
  };
  subscriber?: {
    subscriberId?: string;
    subscriberName?: string;
    subscriberDOB?: string;
  };
  insurance?: {
    companyName?: string;
    insuredName?: string;
    groupNumber?: string;
  };
  benefitsInfo?: Record<string, AppointmentBenefitInfoEntry | unknown> & {
    history?: AppointmentBenefitInfoEntry[];
  };
  verificationFields?: AppointmentVerificationFieldRef[];
  eligibilityResult?: string;
  tenantName?: string;
  userName?: string;
  source?: string;
  InsuranceCompany_Phone?: string;
  InsuranceCompany_Phone_Ext?: string;
  eva?: {
    transcript?: string;
    extractedData?: Record<string, string | null>;
    status?: string;
  };
}
