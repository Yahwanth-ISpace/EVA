import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
// Uncomment if you want to use ConfigService for env variables
// import { ConfigService } from '@nestjs/config';

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
      this.logger.warn(`Invalid Authorization header format: ${authHeader}`);
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const token = authHeader.substring(7).trim(); // Remove "Bearer " prefix and trim

    // If using ConfigService:
    // const expectedToken = this.configService.get<string>('VERIFICATIONS_API_TOKEN')?.trim();

    // Using process.env directly:
    const expectedToken = (process.env.VERIFICATIONS_API_TOKEN ?? '').trim();

    this.logger.log(`Incoming token: "${token}"`);
    this.logger.log(`Expected token: "${expectedToken}"`);

    if (token === expectedToken && expectedToken !== '') {
      console.log('API token is valid');
      return true;
    }

    this.logger.warn('Invalid API token provided');
    throw new UnauthorizedException('Invalid API token');
  }
}
