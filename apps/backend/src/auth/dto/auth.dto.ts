import { Transform, Type } from 'class-transformer';
import {
  IsBase64,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsInt,
  IsBoolean,
  ValidateNested,
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
  @MaxLength(256)
  password: string;

  @ApiPropertyOptional({ description: 'Keep the refresh cookie for 7 days instead of 12 hours.' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

/**
 * Hybrid envelope built in the browser: a one-time AES-256-GCM key encrypts the
 * JSON body, and that key is wrapped with the server's RSA-OAEP-256 public key
 * from `GET /auth/credential-key`. The JSON must include `ts` (ms) and `nonce`.
 */
export class EncryptedCredentialsDto {
  @ApiProperty({ description: 'Key id returned by GET /auth/credential-key' })
  @IsString()
  @MaxLength(64)
  kid: string;

  @ApiProperty({ description: 'Base64 RSA-OAEP-256 wrapped AES-256 key' })
  @IsBase64()
  @MaxLength(1024)
  key: string;

  @ApiProperty({ description: 'Base64 12-byte AES-GCM IV' })
  @IsBase64()
  @MaxLength(32)
  iv: string;

  @ApiProperty({ description: 'Base64 AES-GCM ciphertext with the 16-byte tag appended' })
  @IsBase64()
  @MaxLength(4096)
  data: string;
}

export class EncryptedLoginDto {
  @ApiProperty({ type: EncryptedCredentialsDto, description: 'Encrypts { email, password, ts, nonce }' })
  @ValidateNested()
  @Type(() => EncryptedCredentialsDto)
  credentials: EncryptedCredentialsDto;

  @ApiPropertyOptional({ description: 'Keep the refresh cookie for 7 days instead of 12 hours.' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class EncryptedRegisterDto {
  @ApiProperty({
    type: EncryptedCredentialsDto,
    description: 'Encrypts { fullName, email, password, ts, nonce }',
  })
  @ValidateNested()
  @Type(() => EncryptedCredentialsDto)
  credentials: EncryptedCredentialsDto;
}
