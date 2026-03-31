import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Body for `POST /verifications/:payeeId` — simulate verification from transcript text. */
export class VerifyPayeeTranscriptDto {
  @ApiProperty({
    example:
      'The coverage is 80 percent, deductible 500 dollars, copay 20 dollars, valid through December 2025.',
    description: 'Spoken or written transcript to parse for benefit details.',
  })
  @IsString()
  transcript: string;
}

/** Body for `POST /verifications/:payeeId/push-extracted`. */
export class PushExtractedDto {
  @ApiPropertyOptional({
    example: '80%',
    description: 'Coverage (e.g. percentage).',
  })
  @IsOptional()
  @IsString()
  coverage?: string | null;

  @ApiPropertyOptional({ example: '500 dollars' })
  @IsOptional()
  @IsString()
  deductible?: string | null;

  @ApiPropertyOptional({ example: '20 dollars' })
  @IsOptional()
  @IsString()
  copay?: string | null;

  @ApiPropertyOptional({ example: 'December 31, 2025' })
  @IsOptional()
  @IsString()
  validity?: string | null;

  @ApiPropertyOptional({
    example: 'User: ... EVA: ...',
    description: 'Optional call transcript to append to the verification record.',
  })
  @IsOptional()
  @IsString()
  transcript?: string;
}
