import { ApiPropertyOptional } from '@nestjs/swagger';
import { AgentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateAgentDto {
  @ApiPropertyOptional({ example: 'Insurance Verification Agent1' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  twilioPhoneNumber?: string;

  @ApiPropertyOptional({ example: '+1' })
  @IsOptional()
  @IsString()
  twilioPhoneNumberExt?: string;

  @ApiPropertyOptional({ enum: AgentStatus })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;
}
