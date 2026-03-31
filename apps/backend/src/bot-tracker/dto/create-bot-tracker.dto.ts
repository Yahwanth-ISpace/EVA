import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Body for POST /bot-trackers — live call lines are stored as JSON (usually a string). */
export class CreateBotTrackerDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsNotEmpty()
  @IsUUID()
  payeeId: string;

  @ApiProperty({
    example: 'EVA: Can you provide the deductible?',
    description: 'One line of call log (User:/EVA: or [CALL_EVENT] markers).',
  })
  @IsNotEmpty()
  @IsString()
  callLog: string;
}
