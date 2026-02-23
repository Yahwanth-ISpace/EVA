import { IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { VerificationFieldDto } from './verification-field.dto';

export class UpdateVerificationRequirementDto {
  @IsOptional()
  @IsString()
  payeeId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerificationFieldDto)
  verificationFields?: VerificationFieldDto[];
}
