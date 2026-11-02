import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { secretsEqual } from '../../common/security/timing-safe';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly logger = new Logger(ApiTokenGuard.name);

  // Uncomment if using ConfigService
  // constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader =
      request.headers['authorization'] ||
      request.headers['Authorization'] ||
      '';

    if (!authHeader || typeof authHeader !== 'string') {
      this.logger.warn('Missing Authorization header');
      throw new UnauthorizedException('Missing Authorization header');
    }

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      this.logger.warn('Invalid Authorization header format');
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const token = authHeader.substring(7).trim();
    const expectedToken = (process.env.VERIFICATIONS_API_TOKEN ?? '').trim();

    if (expectedToken && secretsEqual(token, expectedToken)) {
      return true;
    }

    this.logger.warn('Invalid API token provided');
    throw new UnauthorizedException('Invalid API token');
  }
}
