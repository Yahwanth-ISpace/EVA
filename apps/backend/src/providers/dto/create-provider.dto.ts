import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateProviderDto {
  @ApiProperty({ example: 'Sarah' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Johnson' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  npi: string;

  @ApiProperty({ example: 'PPO' })
  @IsString()
  network: string;

  @ApiProperty({ example: 'General Dentistry' })
  @IsString()
  specialty: string;

  @ApiProperty({ example: 'office-uuid-here' })
  @IsString()
  officeId: string;
}
