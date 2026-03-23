import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePayerDto {
  @ApiProperty({ example: 'Acme Insurance Co' })
  @IsString()
  companyName: string;

  @ApiProperty({ example: '+18005551234' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ example: '202' })
  @IsOptional()
  @IsString()
  phoneExt?: string;

  @ApiProperty({ example: 'Enterprise' })
  @IsString()
  groupName: string;

  @ApiProperty({ example: 'ENT-99' })
  @IsString()
  groupNumber: string;

  @ApiProperty({ example: 'acme-biz-key' })
  @IsString()
  businessKey: string;

  @ApiProperty({ example: 'Gold Dental' })
  @IsString()
  planName: string;

  @ApiProperty({ example: 1001 })
  @IsInt()
  pristinePlanId: number;
}
