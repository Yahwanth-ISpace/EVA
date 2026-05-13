import { ApiProperty } from '@nestjs/swagger';

export class BotTrackerDto {
  @ApiProperty({
    description: 'Unique identifier for the bot tracker record',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  id: string;

  @ApiProperty({
    description: 'External patient id (stored as payeeId in DB; same as stream payeeId query param)',
    example: '90560891',
  })
  PatientID: string;

  @ApiProperty({
    description: 'Call log data - accepts any data type',
    example: { duration: 300, status: 'completed', notes: 'verification completed' },
  })
  callLog: any;

  @ApiProperty({
    description: 'Timestamp when the record was created',
    example: '2026-03-25T10:00:00Z',
  })
  createdAt: Date;
}
