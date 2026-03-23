import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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
}
