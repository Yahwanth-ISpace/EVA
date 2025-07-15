import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayerDto } from './dto/create-payer.dto';

@Injectable()
export class PayerService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPayerDto: CreatePayerDto) {
    return this.prisma.payer.create({
      data: createPayerDto,
    });
  }

  async findAll() {
    return this.prisma.payer.findMany();
  }

  async findOne(id: string) {
    const payer = await this.prisma.payer.findUnique({ where: { id } });
    if (!payer) {
      throw new NotFoundException(`Payer with id ${id} not found`);
    }
    return payer;
  }
}
