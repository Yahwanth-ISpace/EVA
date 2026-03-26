import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBotTrackerDto {
  @ApiProperty({
    description: 'UUID of the payee',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsNotEmpty()
  @IsUUID()
  payeeId: string;

  @ApiProperty({
    description: 'Transcript content from the call or interaction',
    example: 'Hello, how can I help you today?',
  })
  @IsNotEmpty()
  @IsString()
  transcript: string;
}
