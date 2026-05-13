import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Body for POST /bot-trackers — live call lines are stored as JSON (usually a string). */
export class CreateBotTrackerDto {
  @ApiProperty({ example: '90560891', description: 'External PatientID (same as media-stream `patientId` / legacy `payeeId`).' })
  @IsNotEmpty()
  @IsString()
  PatientID: string;

  @ApiProperty({
    example: 'EVA: Can you provide the deductible?',
    description: 'One line of call log (User:/EVA: or [CALL_EVENT] markers).',
  })
  @IsNotEmpty()
  @IsString()
  callLog: string;
}
