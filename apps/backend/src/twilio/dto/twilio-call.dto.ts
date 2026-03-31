import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}

/** Body for `POST /twilio/call-ivr-and-bypass`. */
export class TwilioCallIvrDto {
  @ApiPropertyOptional({
    example: '+15559876543',
    description: 'Override IVR destination; defaults to `TWILIO_IVR_PHONE_NUMBER`.',
  })
  to?: string;
}

/** Body for `POST /twilio/end-call` — complete an in-progress call from the dashboard. */
export class TwilioEndCallDto {
  @ApiProperty({
    example: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Twilio Call SID (e.g. from live call events).',
  })
  @IsString()
  @IsNotEmpty()
  callSid: string;
}
