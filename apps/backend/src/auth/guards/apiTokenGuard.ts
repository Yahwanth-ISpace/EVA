import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');

    if (token === process.env.VERIFICATIONS_API_TOKEN) {
      return true;
    }

    throw new UnauthorizedException('Invalid API token');
  }
}
