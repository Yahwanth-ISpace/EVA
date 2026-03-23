import {
  IsEmail,
  IsString,
  MinLength,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayerDto } from 'src/auth/dto/auth.dto';

export class CreatePayeeDto {
  @ApiProperty({ example: 'newpayee@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'TempPass1!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: '1992-03-20' })
  @IsOptional()
  @Type(() => Date)
  dob?: Date;

  @ApiPropertyOptional({ example: '987-65-4321' })
  ssn?: string;

  @ApiPropertyOptional({ type: PayerDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PayerDto)
  payer?: PayerDto;
}
