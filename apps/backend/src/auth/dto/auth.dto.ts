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
} from 'class-validator';
import { Type } from 'class-transformer';

export enum Role {
  ADMIN = 'ADMIN',
  PAYEE = 'PAYEE',
}

export class PayerDto {
  @IsString()
  id: string;

  @IsString()
  companyName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  phoneExt?: string;

  @IsString()
  groupName: string;

  @IsString()
  groupNumber: string;

  @IsString()
  businessKey: string;

  @IsString()
  planName: string;

  pristinePlanId: number;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(Role)
  role: Role;

  @ValidateIf((o) => o.role === Role.PAYEE)
  @IsOptional()
  dob?: Date;

  @ValidateIf((o) => o.role === Role.PAYEE)
  ssn?: string;

  @ValidateIf((o) => o.role === Role.PAYEE)
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => PayerDto)
  payer?: PayerDto;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
