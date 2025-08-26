import type { Payee } from "./payeeTypes";

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
