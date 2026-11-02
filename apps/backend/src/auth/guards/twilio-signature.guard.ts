import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import twilio from 'twilio';

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  private readonly logger = new Logger(TwilioSignatureGuard.name);

  canActivate(context: ExecutionContext): boolean {
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.TWILIO_SKIP_SIGNATURE === 'true'
    ) {
      this.logger.warn('Twilio signature validation skipped (non-production override)');
      return true;
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const base = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
    if (!authToken || !base) {
      throw new UnauthorizedException('Twilio webhook authentication is not configured');
    }

    const req = context.switchToHttp().getRequest();
    const signature = req.headers?.['x-twilio-signature'];
    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Missing Twilio signature');
    }

    const url = `${base}${req.originalUrl || req.url || ''}`;
    const params =
      req.method === 'GET' || req.method === 'HEAD' ? {} : (req.body ?? {});
    const valid = twilio.validateRequest(authToken, signature, url, params);
    if (!valid) {
      throw new UnauthorizedException('Invalid Twilio signature');
    }
    return true;
  }
}
