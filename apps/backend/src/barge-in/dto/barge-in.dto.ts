import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class BargeInDto {
  @IsString()
  @IsNotEmpty()
  appointmentId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}