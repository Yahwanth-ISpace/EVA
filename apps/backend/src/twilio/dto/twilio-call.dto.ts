import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Body for `POST /twilio/call` — start outbound verification call. */
export class TwilioInitiateCallDto {
  @ApiProperty({
    example: '+15551234567',
    description: 'E.164 phone number to dial.',
  })
  to: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Payee (patient) ID — links stream to verification requirement.',
  })
  payeeId: string;

  @ApiPropertyOptional({
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    description:
      'When set, verification from this call is stored against this appointment (separate from other visits for the same payee).',
  })
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiPropertyOptional({
    description:
      'When true, EVA navigates the payer IVR first (recording/language silence, provider/representative prompts, member ID and DOB DTMF), then begins the normal EVA intro once a live agent is detected.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  navigateTpaIvr?: boolean;
}

export class TwilioCallSidDto {
  @ApiProperty({
    example: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Twilio Call SID (e.g. from live call events or `CallSid` on status callbacks).',
  })
  @IsString()
  @IsNotEmpty()
  callSid: string;
}

/** Body for `POST /twilio/end-call` — complete an in-progress call from the dashboard. */
export class TwilioEndCallDto extends TwilioCallSidDto {}

/** Body for `POST /twilio/put-on-hold` — redirect the call to hold TwiML (disconnects media stream until resumed). */
export class TwilioPutOnHoldDto extends TwilioCallSidDto {}
