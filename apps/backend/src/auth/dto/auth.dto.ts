import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsInt,
  IsBoolean,
} from 'class-validator';
import { PasswordPolicy } from '../../common/security/password';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Role {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

export class PayerDto {
  @ApiProperty({ example: 'payer-uuid-from-db' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Acme Dental Insurance' })
  @IsString()
  companyName: string;

  @ApiProperty({ example: '+18005551234' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ example: '101' })
  @IsOptional()
  @IsString()
  phoneExt?: string;

  @ApiProperty({ example: 'Group A' })
  @IsString()
  groupName: string;

  @ApiProperty({ example: 'GRP-001' })
  @IsString()
  groupNumber: string;

  @ApiProperty({ example: 'biz-key-123' })
  @IsString()
  businessKey: string;

  @ApiProperty({ example: 'Premium PPO' })
  @IsString()
  planName: string;

  @ApiProperty({ example: 42 })
  @IsInt()
  pristinePlanId: number;
}

export class RegisterDto {
  @ApiProperty({
    example: 'Jane Operator',
    description: 'Operator display name. This does not link a patient record.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'SecurePass1!word',
    minLength: 12,
    description: 'At least 12 characters with upper, lower, and a number. Role is always OPERATOR.',
  })
  @IsString()
  @PasswordPolicy()
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass1!word' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ description: 'Keep the refresh cookie for 7 days instead of 12 hours.' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
