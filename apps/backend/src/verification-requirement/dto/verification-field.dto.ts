import { IsString, IsBoolean, IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Single field in a verification requirement: name, whether it's required, order of asking, and optional exact question to ask. */
export class VerificationFieldDto {
  @ApiProperty({
    example: 'coverage',
    description: 'Key stored in verification `extractedData` (e.g. coverage, deductible, copay, validity).',
  })
  @IsString()
  field: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  required: boolean;

  @ApiProperty({ example: 1, minimum: 1, description: 'Order in which EVA asks for this field.' })
  @IsInt()
  @Min(1)
  order: number;

  @ApiPropertyOptional({
    example: 'Can you provide me the coverage details for this patient?',
    description:
      'If set, EVA asks this exact sentence instead of generating a question from the field name.',
  })
  @IsOptional()
  @IsString()
  question?: string;
}

export type VerificationFieldEntry = {
  field: string;
  required: boolean;
  order: number;
  question?: string;
};
