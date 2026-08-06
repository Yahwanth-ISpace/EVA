import { ApiProperty } from '@nestjs/swagger';
import { AgentStatus } from '@prisma/client';

export class AgentDto {
  @ApiProperty({
    example: '69c226bfa13e73054507cb1b',
    description: 'MongoDB ObjectId',
  })
  id: string;

  @ApiProperty({
    example: 'Insurance Verification Agent1',
    description: 'Agent name',
  })
  name: string;

  @ApiProperty({
    example: '2345678190',
    description: 'Twilio Phone number',
  })
  twilioPhoneNumber: string;

  @ApiProperty({
    example: '+1',
    description: 'Twilio Phone number extension',
  })
  twilioPhoneNumberExt: string;

  @ApiProperty({
    enum: AgentStatus,
    example: AgentStatus.READY,
    description: 'Current status of the agent',
  })
  status: AgentStatus;

  @ApiProperty({
    example: '2026-03-26T08:46:34.498Z',
    type: 'string',
    format: 'date-time',
    description: 'ISO 8601 formatted start time from MongoDB',
  })
  startTime: Date | null;

  @ApiProperty({
    example: '2026-03-26T09:00:00.000Z',
    type: 'string',
    format: 'date-time',
    description: 'ISO 8601 formatted end time from MongoDB',
  })
  endTime: Date | null;
}
