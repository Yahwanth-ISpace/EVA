import { ApiProperty } from '@nestjs/swagger';

export class BotTrackerDto {
  @ApiProperty({
    description: 'Unique identifier for the bot tracker record',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id: string;

  @ApiProperty({
    description: 'UUID of the payee',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  payeeId: string;

  @ApiProperty({
    description: 'Transcript content from the call or interaction',
    example: 'Hello, how can I help you today?',
  })
  transcript: string;

  @ApiProperty({
    description: 'Timestamp when the record was created',
    example: '2026-03-25T10:00:00Z',
  })
  createdAt: Date;
}
