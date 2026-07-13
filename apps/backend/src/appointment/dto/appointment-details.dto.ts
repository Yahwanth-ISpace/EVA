import { ApiProperty } from '@nestjs/swagger';

export interface BenefitInfo {
  question: string;
  rule: string;
  answer: string;
}

export interface BenefitsInfo {
  [key: string]: BenefitInfo;
}

export class OfficeDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  officeID: number;

  @ApiProperty()
  address: string;
}

export class InsuranceDto {
  @ApiProperty()
  companyName: string;

  @ApiProperty()
  insuredName: string;

  @ApiProperty()
  groupNumber: string;
}

export class PatientDto {
  @ApiProperty()
  patientId: string;

  @ApiProperty()
  patientName: string;

  @ApiProperty()
  patientDOB: string;

  @ApiProperty()
  memberId: string;
}

export class SubscriberDto {
  @ApiProperty()
  subscriberId: string;

  @ApiProperty()
  subscriberName: string;

  @ApiProperty()
  subscriberDOB: string;
}

export class ProviderDto {
  @ApiProperty()
  providerId: string;

  @ApiProperty()
  providerName: string;

  @ApiProperty()
  providerTaxId: string;
}

export class AppointmentDetailsDto {
  @ApiProperty()
  appointmentId: string;

  @ApiProperty()
  appointmentDate: string;

  @ApiProperty()
  eligibilityResult: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ type: OfficeDto })
  office: OfficeDto;

  @ApiProperty({ type: InsuranceDto })
  insurance: InsuranceDto;

  @ApiProperty({ type: PatientDto })
  patient: PatientDto;

  @ApiProperty({ type: SubscriberDto })
  subscriber: SubscriberDto;

  @ApiProperty({ type: ProviderDto })
  provider: ProviderDto;

  @ApiProperty()
  tenantName: string;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  source: string;

  @ApiProperty()
  savedAt: string;

  @ApiProperty()
  InsuranceCompany_Phone: string;

  @ApiProperty()
  InsuranceCompany_Phone_Ext: string;

  @ApiProperty({
    description: 'Benefit fields to be verified',
    example: {
      GroupName: {
        question: 'What is the insurance group name?',
        rule: 'Answer should be the insurance group name as provided by the payer. Return text only.',
        answer: '',
      },
      GroupNumber: {
        question: 'What is the insurance group number?',
        rule: 'Answer should be the insurance group number. Return alphanumeric value exactly as provided.',
        answer: '',
      },
    },
  })
  benefitsInfo?: BenefitsInfo;
}
