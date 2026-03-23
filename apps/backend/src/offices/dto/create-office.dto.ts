import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateOfficeDto {
  @ApiProperty({ example: 'Main Street Clinic' })
  @IsString()
  name: string;

  @ApiProperty({ example: '123 Main St' })
  @IsString()
  address1: string;

  @ApiPropertyOptional({ example: 'Suite 200' })
  @IsOptional()
  @IsString()
  address2?: string;

  @ApiProperty({ example: 'Austin' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'TX' })
  @IsString()
  state: string;

  @ApiProperty({ example: '78701' })
  @IsString()
  zip: string;

  @ApiProperty({ example: 'OFF-001' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'provider-uuid-here' })
  @IsString()
  providerId: string;
}
