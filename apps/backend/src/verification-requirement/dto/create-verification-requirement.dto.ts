import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { VerificationFieldDto } from './verification-field.dto';

export class CreateVerificationRequirementDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Payee (patient) this requirement applies to.',
  })
  @IsString()
  payeeId: string;

  @ApiProperty({
    type: [VerificationFieldDto],
    example: [
      { field: 'coverage', required: true, order: 1 },
      {
        field: 'deductible',
        required: true,
        order: 2,
        question: 'What is the annual deductible?',
      },
    ],
    description:
      'Ordered list of fields to collect. Optional `question` overrides the default phrasing for that field.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VerificationFieldDto)
  verificationFields: VerificationFieldDto[];
}
