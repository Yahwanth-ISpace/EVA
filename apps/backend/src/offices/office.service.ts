import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';

@Injectable()
export class OfficeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOfficeDto) {
    const db = await this.prisma.client();
    const created = await db.orm.Office.create({
      name: dto.name,
      address1: dto.address1,
      address2: dto.address2 ?? null,
      city: dto.city,
      state: dto.state,
      zip: dto.zip,
      code: dto.code,
      providerId: dto.providerId,
    });
    const office = await db.orm.Office.where({ _id: created._id })
      .include('provider')
      .first();
    return this.prisma.withIds(office);
  }

  async findAll() {
    const db = await this.prisma.client();
    return this.prisma.withIds(await db.orm.Office.include('provider').all());
  }

  async findByProviderId(providerId: string) {
    const db = await this.prisma.client();
    return this.prisma.withIds(
      await db.orm.Office.where({ providerId }).include('provider').all(),
    );
  }

  async findOne(id: string) {
    const db = await this.prisma.client();
    const office = await db.orm.Office.where({ _id: id })
      .include('provider')
      .first();

    if (!office) throw new NotFoundException('Office not found');

    return this.prisma.withIds(office);
  }
}
