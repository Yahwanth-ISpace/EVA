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
import { PayerDto } from 'src/auth/dto/auth.dto';

export class CreatePayeeDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @Type(() => Date)
  dob?: Date;

  ssn?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PayerDto)
  payer?: PayerDto;
}
