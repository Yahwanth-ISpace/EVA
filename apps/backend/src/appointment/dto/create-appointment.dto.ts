import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import {
  GeneralDetails,
  PatientDetails,
  InsuranceDetails,
  InsuranceGroup,
  ProviderFacilityDetails,
  CallingScript,
  VerificationField,
} from './appointment-details.dto';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'payee-uuid-here' })
  @IsString()
  payeeId: string;

  @ApiProperty({ example: 'provider-uuid-here' })
  @IsString()
  providerId: string;

  @ApiProperty({ example: 'office-uuid-here' })
  @IsString()
  officeId: string;

  @ApiProperty({ example: '2025-04-15T14:00:00.000Z' })
  @IsString()
  date: string;

  @ApiPropertyOptional({ example: 'First cleaning visit' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: [
      {
        question: 'What is the patient’s date of birth?',
        field: 'patient_dob',
        order: 1,
      },
    ],
  })
  verificationFields?: VerificationField[];

  @ApiPropertyOptional({
    example: {
      general_details: {
        appointment_type: 'Cleaning',
        reason_for_visit: 'Routine check-up',
      },
    },
  })
  general_details?: GeneralDetails;

  @ApiPropertyOptional({
    example: {
      patient_details: { patient_name: 'John Doe', patient_dob: '1990-01-01' },
    },
  })
  patient_details?: PatientDetails;
  @ApiPropertyOptional({
    example: {
      insurance_details: {
        insurance_id: 'INS-12345',
        group_number: 'GRP-67890',
      },
    },
  })
  insurance_details?: InsuranceDetails;
  @ApiPropertyOptional({
    example: {
      insurance_group: { group_name: 'HealthPlus', group_number: 'GRP-67890' },
    },
  })
  insurance_group?: InsuranceGroup;
  @ApiPropertyOptional({
    example: {
      provider_facility_details: {
        facility_name: 'City Medical Center',
        facility_address: '123 Main St',
      },
    },
  })
  provider_facility_details?: ProviderFacilityDetails;
  @ApiPropertyOptional({
    example: {
      calling_script: {
        Client_Specific_Fields:
          'Please verify the patient’s insurance information before the call.',
      },
    },
  })
  calling_script: CallingScript;
}
