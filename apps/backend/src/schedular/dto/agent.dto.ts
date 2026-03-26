import { ApiProperty } from '@nestjs/swagger';

export enum AgentStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'inprogress',
  COMPLETED = 'completed',
}

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

  @ApiProperty({ example: '2024-03-23T10:00:00Z' })
  startTime: Date;

  @ApiProperty({ example: '2024-03-23T10:30:00Z' })
  endTime: Date;
}
