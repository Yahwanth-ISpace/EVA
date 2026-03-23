import { IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationFieldDto } from './verification-field.dto';

export class UpdateVerificationRequirementDto {
  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsOptional()
  @IsString()
  payeeId?: string;

  @ApiPropertyOptional({ type: [VerificationFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerificationFieldDto)
  verificationFields?: VerificationFieldDto[];
}
