import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  ValidateIf,
  IsObject,
  IsOptional,
  ValidateNested,
  IsNotEmpty,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass1!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: Role, example: Role.OPERATOR })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ example: '1990-05-15', description: 'Required context for OPERATOR role.' })
  @ValidateIf((o) => o.role === Role.OPERATOR)
  @IsOptional()
  dob?: Date;

  @ApiPropertyOptional({ example: '123-45-6789', description: 'OPERATOR only.' })
  @ValidateIf((o) => o.role === Role.OPERATOR)
  ssn?: string;

  @ApiPropertyOptional({ type: PayerDto, description: 'Required when role is OPERATOR.' })
  @ValidateIf((o) => o.role === Role.OPERATOR)
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => PayerDto)
  payer?: PayerDto;
}

export class LoginDto {
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass1!' })
  @IsString()
  @MinLength(6)
  password: string;
}
