import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SaveEligibilityDto {
  @ApiProperty({
    description:
      'Extracted verification field keys and values (e.g. GroupName, history.D0120)',
    example: {
      GroupName: 'MONARCH PROPERTIES',
      GroupNumber: '1652839',
      'history.D0120': '01/15/2024',
    },
  })
  @IsObject()
  extractedData!: Record<string, string | null>;
}
