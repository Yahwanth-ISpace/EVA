import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_COOKIE } from './cookies';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, jwtSecret } from '../config/jwt-config';
import { AccountApprovalService, AccountStatus } from './account-approval.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly approvals: AccountApprovalService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: { cookies?: Record<string, string | undefined> }) =>
          req?.cookies?.[ACCESS_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  }

  /** Role and approval come from the database so demotions and rejections apply immediately. */
  async validate(payload: { sub?: string; email?: string; role?: string; purpose?: string }) {
    if (payload.purpose || !payload.sub) {
      throw new UnauthorizedException();
    }
    const principal = await this.approvals.principal(payload.sub);
    if (!principal || principal.status !== AccountStatus.APPROVED) {
      throw new UnauthorizedException();
    }
    return { userId: principal.userId, email: payload.email, role: principal.role };
  }
}
