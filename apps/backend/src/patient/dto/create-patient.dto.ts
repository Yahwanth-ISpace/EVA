import { IsString } from 'class-validator';

export class CreatePatientDto {
  @IsString()
  fullName: string;

  @IsString()
  dob: string;

  @IsString()
  insuranceProvider: string;

  @IsString()
  memberId: string;
}
