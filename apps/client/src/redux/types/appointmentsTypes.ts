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

export interface AppointmentRecord {
  id: string;
  payeeId: string;
  patientId: string;
  providerId: string;
  officeId: string;
  date: string;
  reason: string;
  status: "SCHEDULED" | "ERROR" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  notes: string;
  payee: Payee;
  provider: Provider;
  office: Office;
}
