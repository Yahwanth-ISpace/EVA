import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VerificationFieldDto } from './verification-field.dto';

export class CreateVerificationRequirementDto {
  @IsString()
  payeeId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerificationFieldDto)
  verificationFields: VerificationFieldDto[];
}
