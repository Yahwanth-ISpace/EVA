import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ example: 'Insurance Verification Agent1' })
  @IsString()
  name: string;

  @ApiProperty({ example: '+15551234567' })
  @IsString()
  twilioPhoneNumber: string;

  @ApiPropertyOptional({ example: '+1', default: '+1' })
  @IsOptional()
  @IsString()
  twilioPhoneNumberExt?: string;

  @ApiPropertyOptional({ enum: AgentStatus, default: AgentStatus.READY })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;
}
