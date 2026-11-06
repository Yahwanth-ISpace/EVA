import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS } from '../common/security/password';
import { CreateUserDto, UpdateUserProfileDto } from './dto/user-admin.dto';
import { Role } from '../prisma/enums';
import { AccountApprovalService, AccountStatus } from '../auth/account-approval.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: AccountApprovalService,
  ) {}

  async create(dto: CreateUserDto, createdBy?: string) {
    const db = await this.prisma.client();
    const email = dto.email.trim().toLowerCase();
    const existing =
      (await db.orm.User.where({ email: dto.email.trim() }).first()) ??
      (await db.orm.User.where({ email }).first());
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }
    const created = await db.orm.User.create({
      email,
      password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      role: dto.role,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      dob: dto.dob ? new Date(dto.dob) : null,
    });
    const user = this.publicUser(created);
    if (user.id) await this.approvals.setStatus(user.id, AccountStatus.APPROVED, createdBy);
    return user;
  }

  async updateProfile(id: string, dto: UpdateUserProfileDto) {
    const db = await this.prisma.client();
    const existing = await db.orm.User.where({ _id: id }).first();
    if (!existing) throw new NotFoundException('User not found');
    const update: Record<string, unknown> = {};
    if (dto.firstName !== undefined) update.firstName = dto.firstName;
    if (dto.lastName !== undefined) update.lastName = dto.lastName;
    if (dto.dob !== undefined) update.dob = dto.dob ? new Date(dto.dob) : null;
    if (dto.role !== undefined) update.role = dto.role;
    await db.orm.User.where({ _id: id }).update(update);
    this.approvals.invalidate(id);
    const updated = await db.orm.User.where({ _id: id }).first();
    return this.publicUser(updated);
  }

  private publicUser(user: { _id?: unknown; email?: string; role?: Role; firstName?: string | null; lastName?: string | null; dob?: Date | null } | null) {
    const mapped = this.prisma.withIds(user) as {
      id?: string;
      email?: string;
      role?: Role;
      firstName?: string | null;
      lastName?: string | null;
      dob?: Date | null;
    };
    return {
      id: mapped.id,
      email: mapped.email,
      role: mapped.role,
      firstName: mapped.firstName ?? null,
      lastName: mapped.lastName ?? null,
      dob: mapped.dob ?? null,
    };
  }
}
