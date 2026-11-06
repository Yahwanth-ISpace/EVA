import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { MongoService } from '../mongo/mongo.service';

export enum AccountStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

type ApprovalDoc = {
  userId: string;
  status: AccountStatus;
  requestedAt?: Date;
  decidedAt?: Date;
  decidedBy?: string;
};

export type Principal = { userId: string; role: Role; status: AccountStatus };

const CACHE_MS = 30_000;

@Injectable()
export class AccountApprovalService {
  private readonly cache = new Map<string, { value: Principal | null; until: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongo: MongoService,
  ) {}

  private async collection() {
    const db = await this.mongo.getDb();
    return db.collection<ApprovalDoc>('account_approvals');
  }

  /**
   * Accounts without an approval record predate this workflow. Administrators
   * keep access; everyone else waits for an administrator to approve them.
   */
  statusFrom(doc: ApprovalDoc | null, role: Role): AccountStatus {
    if (doc?.status) return doc.status;
    return role === Role.ADMIN ? AccountStatus.APPROVED : AccountStatus.PENDING;
  }

  async statusFor(userId: string, role: Role): Promise<AccountStatus> {
    const col = await this.collection();
    return this.statusFrom(await col.findOne({ userId }), role);
  }

  /** Current role and status from the database, cached briefly per user. */
  async principal(userId: string): Promise<Principal | null> {
    const hit = this.cache.get(userId);
    if (hit && hit.until > Date.now()) return hit.value;
    const db = await this.prisma.client();
    const found = await db.orm.User.where({ _id: userId }).first();
    let value: Principal | null = null;
    if (found) {
      const user = this.prisma.withIds(found) as { id: string; role: Role };
      value = { userId: user.id, role: user.role, status: await this.statusFor(user.id, user.role) };
    }
    this.cache.set(userId, { value, until: Date.now() + CACHE_MS });
    return value;
  }

  invalidate(userId: string) {
    this.cache.delete(userId);
  }

  async setStatus(userId: string, status: AccountStatus, decidedBy?: string) {
    const col = await this.collection();
    const now = new Date();
    await col.updateOne(
      { userId },
      {
        $set: {
          status,
          ...(decidedBy ? { decidedAt: now, decidedBy } : {}),
        },
        $setOnInsert: { userId, requestedAt: now },
      },
      { upsert: true },
    );
    this.invalidate(userId);
  }

  async decide(userId: string, status: AccountStatus.APPROVED | AccountStatus.REJECTED, adminId: string) {
    const db = await this.prisma.client();
    const user = await db.orm.User.where({ _id: userId }).first();
    if (!user) throw new NotFoundException('User not found');
    await this.setStatus(userId, status, adminId);
    if (status === AccountStatus.REJECTED) {
      const mongo = await this.mongo.getDb();
      await mongo.collection('auth_sessions').deleteMany({ userId });
    }
  }

  async list(status?: AccountStatus) {
    const db = await this.prisma.client();
    const rows = (await db.orm.User.all()) as unknown as unknown[];
    const users = rows.map(
      (u) =>
        this.prisma.withIds(u) as {
          id: string;
          email: string;
          role: Role;
          firstName?: string | null;
          lastName?: string | null;
          createdAt?: Date;
        },
    );
    const col = await this.collection();
    const docs = await col.find({ userId: { $in: users.map((u) => u.id) } }).toArray();
    const byUser = new Map(docs.map((d) => [d.userId, d]));
    return users
      .map((u) => {
        const doc = byUser.get(u.id) ?? null;
        return {
          id: u.id,
          email: u.email,
          role: u.role,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          createdAt: u.createdAt ?? null,
          status: this.statusFrom(doc, u.role),
          decidedAt: doc?.decidedAt ?? null,
        };
      })
      .filter((u) => !status || u.status === status);
  }
}
