import {
  createHash,
  randomBytes,
} from 'crypto';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Role } from '../prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { MongoService } from '../mongo/mongo.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { BCRYPT_ROUNDS } from '../common/security/password';
import { AccountApprovalService, AccountStatus } from './account-approval.service';
import {
  REFRESH_COOKIE,
  REFRESH_MS,
  REMEMBER_MS,
  clearAuthCookies,
  setAuthCookies,
  setCsrfCookie,
} from './cookies';

type SessionUser = {
  id: string;
  email: string;
  role: Role;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
  dob?: Date | null;
  payee?: Record<string, unknown> | null;
};

function splitOperatorName(fullName: string): {
  firstName: string;
  lastName: string | null;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName: lastName || null };
}

export const INVALID_LOGIN_MESSAGE = 'Login failed; invalid email or password.';
export const REGISTRATION_MESSAGE =
  'Registration request received. If the email can be registered, an administrator will review it before you can sign in.';

let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
  return dummyHashPromise;
}

function requestMeta(req?: Request) {
  if (!req) return {};
  return { ip: req.ip ?? null, userAgent: req.get?.('user-agent') ?? null };
}

type RefreshDoc = {
  familyId: string;
  userId: string;
  tokenHash: string;
  previousHashes?: string[];
  expiresAt: Date;
  remember?: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mongo: MongoService,
    private approvals: AccountApprovalService,
    private audit: AuditService,
  ) {}

  /**
   * Always answers the same way so the response does not reveal whether the
   * email is already registered. New accounts cannot sign in until approved.
   */
  async register(dto: RegisterDto, req?: Request) {
    const db = await this.prisma.client();
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.findByEmailAnyCase(dto.email);
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    if (!existingUser) {
      const { firstName, lastName } = splitOperatorName(dto.fullName);
      const created = await db.orm.User.create({
        email,
        password: hashedPassword,
        role: Role.OPERATOR,
        dob: null,
        firstName,
        lastName,
      });
      const user = this.prisma.withIds(created) as { id: string };
      await this.approvals.setStatus(user.id, AccountStatus.PENDING);
      await this.audit.record({
        action: 'auth.register',
        outcome: 'success',
        targetId: user.id,
        ...requestMeta(req),
      });
    } else {
      await this.audit.record({
        action: 'auth.register',
        outcome: 'failure',
        detail: { reason: 'email-exists' },
        ...requestMeta(req),
      });
    }

    return { message: REGISTRATION_MESSAGE };
  }

  async login(dto: LoginDto, res: Response, req?: Request) {
    const user = await this.findByEmailAnyCase(dto.email);
    // Compare against a dummy hash for unknown emails so timing does not reveal which accounts exist.
    const isValid = await bcrypt.compare(dto.password, user?.password ?? (await dummyHash()));
    if (!user || !isValid) {
      await this.audit.record({
        action: 'auth.login',
        outcome: 'failure',
        actorId: user?.id ?? null,
        detail: { reason: 'invalid-credentials' },
        ...requestMeta(req),
      });
      throw new UnauthorizedException(INVALID_LOGIN_MESSAGE);
    }

    const status = await this.approvals.statusFor(user.id, user.role);
    if (status !== AccountStatus.APPROVED) {
      await this.audit.record({
        action: 'auth.login',
        outcome: 'denied',
        actorId: user.id,
        actorRole: user.role,
        detail: { reason: `account-${status.toLowerCase()}` },
        ...requestMeta(req),
      });
      throw new ForbiddenException(
        status === AccountStatus.PENDING
          ? 'Your account is awaiting administrator approval.'
          : 'Your account is not active. Contact an administrator.',
      );
    }

    await this.audit.record({
      action: 'auth.login',
      outcome: 'success',
      actorId: user.id,
      actorRole: user.role,
      ...requestMeta(req),
    });
    const remember = dto.rememberMe === true;
    return this.issueSession(res, user, remember);
  }

  async refresh(req: Request, res: Response) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new UnauthorizedException('Session expired');
    const rotated = await this.rotateRefresh(presented);
    if (!rotated) throw new UnauthorizedException('Session expired');
    const user = await this.findById(rotated.userId);
    if (!user || !(await this.isApproved(user))) {
      await this.revokeRefresh(rotated.refresh);
      throw new UnauthorizedException('Session expired');
    }
    return this.issueSession(res, user, rotated.remember, rotated);
  }

  private async isApproved(user: SessionUser) {
    return (await this.approvals.statusFor(user.id, user.role)) === AccountStatus.APPROVED;
  }

  async logout(req: Request, res: Response) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) await this.revokeRefresh(presented);
    clearAuthCookies(res);
    return { ok: true };
  }

  issueCsrf(req: Request, res: Response) {
    if (!req.cookies?.[REFRESH_COOKIE]) return { csrfToken: null };
    const csrfToken = randomBytes(32).toString('base64url');
    setCsrfCookie(res, csrfToken);
    return { csrfToken };
  }

  async session(userId: string) {
    const user = await this.findById(userId);
    if (!user || !(await this.isApproved(user))) throw new UnauthorizedException('Session expired');
    const csrfToken = randomBytes(32).toString('base64url');
    return { user: this.publicUser(user), csrfToken, setCsrf: csrfToken };
  }

  private async issueSession(
    res: Response,
    user: SessionUser,
    remember: boolean,
    existing?: { refresh: string; familyId: string },
  ) {
    const access = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' },
    );
    const refresh = existing?.refresh ?? randomBytes(32).toString('base64url');
    const familyId = existing?.familyId ?? randomBytes(16).toString('hex');
    if (!existing) await this.storeRefresh(user.id, refresh, familyId, remember);
    const csrfToken = randomBytes(32).toString('base64url');
    setAuthCookies(res, access, refresh, csrfToken, remember);
    return { user: this.publicUser(user), csrfToken };
  }

  /** Only what the UI needs. Patient details (DOB, SSN, payer) are fetched on demand. */
  private publicUser(user: SessionUser) {
    const payeeId = (user.payee as { id?: string } | null | undefined)?.id;
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      ...(user.role === Role.OPERATOR && payeeId && { payeeId }),
    };
  }

  private async findByEmail(email: string): Promise<SessionUser | null> {
    const db = await this.prisma.client();
    const found = await db.orm.User.where({ email }).include('payee').first();
    return found ? (this.prisma.withIds(found) as SessionUser) : null;
  }

  private async findByEmailAnyCase(email: string): Promise<SessionUser | null> {
    const trimmed = email.trim();
    return (
      (await this.findByEmail(trimmed)) ??
      (trimmed.toLowerCase() !== trimmed ? await this.findByEmail(trimmed.toLowerCase()) : null)
    );
  }

  private async findById(id: string): Promise<SessionUser | null> {
    const db = await this.prisma.client();
    const found = await db.orm.User.where({ _id: id }).include('payee').first();
    return found ? (this.prisma.withIds(found) as SessionUser) : null;
  }

  private async sessionCollection() {
    const db = await this.mongo.getDb();
    return db.collection<RefreshDoc>('auth_sessions');
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async storeRefresh(
    userId: string,
    token: string,
    familyId: string,
    remember: boolean,
  ) {
    const col = await this.sessionCollection();
    const expiresAt = new Date(Date.now() + (remember ? REMEMBER_MS : REFRESH_MS));
    await col.insertOne({
      familyId,
      userId,
      tokenHash: this.tokenHash(token),
      previousHashes: [],
      expiresAt,
      remember,
    });
  }

  private async rotateRefresh(presented: string): Promise<{
    userId: string;
    remember: boolean;
    refresh: string;
    familyId: string;
  } | null> {
    const col = await this.sessionCollection();
    const hash = this.tokenHash(presented);
    const current = await col.findOne({ tokenHash: hash });
    if (!current) {
      const reused = await col.findOne({ previousHashes: hash });
      if (reused) await col.deleteMany({ familyId: reused.familyId });
      return null;
    }
    if (new Date(current.expiresAt).getTime() <= Date.now()) {
      await col.deleteOne({ tokenHash: hash });
      return null;
    }
    const refresh = randomBytes(32).toString('base64url');
    const remember = current.remember === true;
    const previous = [...(current.previousHashes ?? []), hash].slice(-20);
    const expiresAt = new Date(Date.now() + (remember ? REMEMBER_MS : REFRESH_MS));
    await col.updateOne(
      { tokenHash: hash },
      {
        $set: {
          tokenHash: this.tokenHash(refresh),
          previousHashes: previous,
          expiresAt,
        },
      },
    );
    return { userId: current.userId, remember, refresh, familyId: current.familyId };
  }

  private async revokeRefresh(presented: string) {
    const col = await this.sessionCollection();
    await col.deleteOne({ tokenHash: this.tokenHash(presented) });
  }

}
