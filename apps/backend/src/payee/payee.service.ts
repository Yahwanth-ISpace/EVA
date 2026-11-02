import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayeeDto } from './dto/create-payee.dto';
import { PayerDto } from 'src/auth/dto/auth.dto';
import { encryptSsn, presentPayee } from '../common/security/ssn';

@Injectable()
export class PayeeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePayeeDto | undefined) {
    if (!data) throw new BadRequestException('Missing payee data');

    const db = await this.prisma.client();
    const payerId = data.payer ? await this.resolvePayerId(db, data.payer) : null;
    const payee = await db.orm.Payee.create({
      firstName: data.firstName,
      lastName: data.lastName,
      dob: data.dob ?? null,
      ssn: encryptSsn(data.ssn),
      userId: null,
      payerId,
    });
    return this.present(payee);
  }

  async findAll() {
    const db = await this.prisma.client();
    const rows = await db.orm.Payee.include('payer').include('user').all();
    return (Array.isArray(rows) ? rows : []).map((row) => this.present(row));
  }

  async findOne(id: string) {
    const db = await this.prisma.client();
    const payee = await db.orm.Payee.where({ _id: id })
      .include('payer')
      .include('user')
      .first();
    if (!payee) return null;
    return this.present(payee);
  }

  async update(id: string, data: Partial<CreatePayeeDto>) {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException('Payee not found');
    }

    const db = await this.prisma.client();
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.dob !== undefined) updateData.dob = data.dob ?? null;
    if (data.ssn !== undefined) updateData.ssn = encryptSsn(data.ssn);
    if (data.payer) {
      updateData.payerId = await this.resolvePayerId(db, data.payer);
    }

    await db.orm.Payee.where({ _id: id }).update(updateData);
    return this.present(
      await db.orm.Payee.where({ _id: id })
        .include('payer')
        .include('user')
        .first(),
    );
  }

  private present<T>(payee: T): T {
    const withIds = this.prisma.withIds(payee) as Record<string, unknown> | null;
    if (withIds?.user && typeof withIds.user === 'object') {
      const { password: _password, ...user } = withIds.user as Record<string, unknown>;
      withIds.user = user;
    }
    return presentPayee(withIds) as T;
  }

  private async resolvePayerId(db: Awaited<ReturnType<PrismaService['client']>>, payer: PayerDto) {
    const existing = await db.orm.Payer.where({ _id: payer.id }).first();
    if (existing) return existing._id;
    const created = await db.orm.Payer.create({
      companyName: payer.companyName,
      phone: payer.phone,
      phoneExt: payer.phoneExt ?? null,
      groupName: payer.groupName,
      groupNumber: payer.groupNumber,
      businessKey: payer.businessKey,
      planName: payer.planName,
      pristinePlanId: payer.pristinePlanId,
    });
    return created._id;
  }
}
