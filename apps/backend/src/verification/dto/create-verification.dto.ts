import { IsString } from 'class-validator';

export class CreateVerificationDto {
  @IsString()
  patientId: string;
}
