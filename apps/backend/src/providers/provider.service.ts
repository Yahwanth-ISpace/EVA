import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';

@Injectable()
export class ProviderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProviderDto) {
    const db = await this.prisma.client();
    const created = await db.orm.Provider.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      npi: dto.npi,
      network: dto.network,
      specialty: dto.specialty,
    });
    const provider = await db.orm.Provider.where({ _id: created._id })
      .include('offices')
      .first();
    return this.prisma.withIds(provider);
  }

  async findAll() {
    const db = await this.prisma.client();
    return this.prisma.withIds(
      await db.orm.Provider.include('offices').all(),
    );
  }

  async findOne(id: string) {
    const db = await this.prisma.client();
    const provider = await db.orm.Provider.where({ _id: id })
      .include('offices')
      .first();

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return this.prisma.withIds(provider);
  }
}
