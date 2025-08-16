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

export type createAppointmentPayload = {
    date: string;
    notes: string;
    payeeId: string;
    providerId: string;
    officeId: string;
}

export type CoverageData = PatientInfo & {
  deductible: string;
  maxAnnualBenefit: string;
  coverage: {
    [key: string]: string;
  };
};

export interface Payee {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dob: string;
  ssn: string;
  payerId: string;
}

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

export interface Patient {
  id: string;
  payeeId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO string format
  gender: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
  updatedAt: string;
  payee: Payee;
}

export interface Provider {
  id: string;
  name: string;
  specialty: string;
  firstName: string;
  lastName: string;
  network?: string;
  npi?: string;
  phone: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  offices?: Office[]; // optional, in case you want to include office list
}

export interface Office {
  id: string;
  providerId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
  provider: Provider;
}

export interface VerificationRecord {
  id: string;
  payee: { firstName: string; lastName: string };
  coverage: string;
  copay: string;
  deductible: string;
  validity: string;
}

export interface AppointmentRecord {
  id: string;
  payeeId: string;
  patientId: string;
  providerId: string;
  officeId: string;
  date: string;
  reason: string;
  status: string; // e.g., "SCHEDULED", "COMPLETED", "CANCELLED"
  createdAt: string;
  updatedAt: string;
  payee: Payee;
  patient: Patient;
  provider: Provider;
  office: Office;
  notes: string;
}
