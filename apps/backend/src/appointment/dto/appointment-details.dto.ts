import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsOptional, IsString } from 'class-validator';

export interface VerificationField {
  question: string;
  field: string;
  rule: string;
  order: number;
  procedureCode?: string;
  dependencies?: string[];
  value?: string;
}
export interface BenefitInfo {
  question: string;
  rule: string;
  procedureCode?: string;
  dependencies?: string[];
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

export interface EvaVerification {
  status?: string;

  transcript?: string;

  extractedData?: Record<string, string | null>;

  call?: {
    callSid?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    duration?: number | null;
  };
}

export class AppointmentDetailsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @Allow()
  @ApiProperty()
  appointmentId: string;

  @Allow()
  @ApiProperty()
  appointmentDate: string;

  @Allow()
  @ApiProperty()
  eligibilityResult: string;

  @Allow()
  @ApiProperty()
  status: string;

  @Allow()
  @ApiProperty({ type: OfficeDto })
  office: OfficeDto;

  @Allow()
  @ApiProperty({ type: InsuranceDto })
  insurance: InsuranceDto;

  @Allow()
  @ApiProperty({ type: PatientDto })
  patient: PatientDto;

  @Allow()
  @ApiProperty({ type: SubscriberDto })
  subscriber: SubscriberDto;

  @Allow()
  @ApiProperty({ type: ProviderDto })
  provider: ProviderDto;

  @Allow()
  @ApiProperty()
  tenantName: string;

  @Allow()
  @ApiProperty()
  userName: string;

  @Allow()
  @ApiProperty()
  source: string;

  @Allow()
  @ApiProperty()
  savedAt: string;

  @Allow()
  @ApiProperty()
  InsuranceCompany_Phone: string | undefined;

  @Allow()
  @ApiProperty()
  InsuranceCompany_Phone_Ext: string | undefined;

  @Allow()
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

  @Allow()
  @ApiProperty({
    description: 'EVA verification details',
    example: {
      status: 'completed',
      transcript: 'Hello, this is a sample transcript of the verification call.',
      extractedData: {
        coverage: 'Full coverage',
        deductible: '$500',
      },
      call: {
        callSid: 'call_sid_123',
        startedAt: '2023-01-01T00:00:00Z',
        endedAt: '2023-01-01T00:05:00Z',
        duration: 300,
      },
    },
  })
  eva?: EvaVerification;
}
