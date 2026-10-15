import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayerDto } from './dto/create-payer.dto';

@Injectable()
export class PayerService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPayerDto: CreatePayerDto) {
    const db = await this.prisma.client();
    const payer = await db.orm.Payer.create({
      ...createPayerDto,
      phoneExt: createPayerDto.phoneExt ?? null,
    });
    return this.prisma.withIds(payer);
  }

  async findAll() {
    const db = await this.prisma.client();
    return this.prisma.withIds(await db.orm.Payer.all());
  }

  async findOne(id: string) {
    const db = await this.prisma.client();
    const payer = await db.orm.Payer.where({ _id: id }).first();
    if (!payer) {
      throw new NotFoundException(`Payer with id ${id} not found`);
    }
    return this.prisma.withIds(payer);
  }
}
