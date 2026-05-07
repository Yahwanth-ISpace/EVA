import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface GeneralDetails {
  ClientID: number;
  UserID: number;
  AppointmentID: number;
  AppointmentDate: string;
  AppointmentNote: string;
}

export interface PatientDetails {
  PatientID: string;
  PatientBusinessKey: string;
  Patient_FirstName: string;
  Patient_LastName: string;
  Patient_Mi: string;
  Patient_DOB: string;
  SSN: string;
  Patient_Zip: string;
  Insured_FirstName: string;
  Insured_LastName: string;
  Insured_DOB: string;
  SubscriberID: string;
}

export interface InsuranceDetails {
  InsuranceCompany_Name: string;
  InsuranceCompany_Phone: string;
  InsuranceCompany_Phone_Ext: string;
}

export interface InsuranceGroupItem {
  question: string;
  answer: string;
}

export interface InsuranceGroup {
  GroupName: InsuranceGroupItem;
  GroupNumber: InsuranceGroupItem;
}

export interface ProviderFacilityDetails {
  Provider_FirstName: string;
  Provider_LastName: string;
  Provider_Mi: string;
  Tax_id: string;
  Provider_IsNonPerson: boolean;
  Provider_NPI: string;
  Provider_Network: string;
  Provider_Specialty: string;
  OfficeName: string;
  OfficeBusinessKey: string;
  OfficeID: number;
  OfficeCode: string;
  OfficeStreet1: string;
  OfficeStreet2: string;
  OfficeCity: string;
  OfficeState: string;
  OfficeZip: string;
}

export interface CallingScript {
  Client_Specific_Fields: string;
}

export interface VerificationField {
  question: string;
  field: string;
  order: number;
  value?: string;
}

export interface AppointmentDetailsDto {
  general_details: GeneralDetails;
  patient_details: PatientDetails;
  insurance_details: InsuranceDetails;
  insurance_group: InsuranceGroup;
  provider_facility_details: ProviderFacilityDetails;
  calling_script: CallingScript;
  verificationFields: VerificationField[];
}
