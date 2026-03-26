import { ApiProperty } from '@nestjs/swagger';
import { AgentStatus } from '@prisma/client';

export class AgentDto {
  @ApiProperty({ example: 'uuid-1234' })
  id: string;

  @ApiProperty({ example: 'Appointment Check' })
  name: string;

  @ApiProperty({
    enum: AgentStatus,
    example: AgentStatus.COMPLETED,
    description: 'Current status of the scheduled task',
  })
  status: AgentStatus;

  @ApiProperty({ example: '2024-03-23T10:00:00Z', type: 'string' })
  startTime: string | null;

  @ApiProperty({ example: '2024-03-23T10:30:00Z', type: 'string' })
  endTime: string | null;
}
