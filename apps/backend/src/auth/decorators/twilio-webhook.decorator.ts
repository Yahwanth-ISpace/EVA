import { applyDecorators, UseGuards } from '@nestjs/common';
import { Public } from './public.decorator';
import { TwilioSignatureGuard } from '../guards/twilio-signature.guard';

/** Opt out of JWT and require a valid X-Twilio-Signature. */
export function TwilioWebhook() {
  return applyDecorators(Public(), UseGuards(TwilioSignatureGuard));
}
