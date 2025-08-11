import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfficeDto } from './dto/create-office.dto';

@Injectable()
export class OfficeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOfficeDto) {
    return this.prisma.office.create({
      data: {
        name: dto.name,
        address1: dto.address1,
        address2: dto.address2 ?? null,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        code: dto.code,
        provider: {
          connect: { id: dto.providerId },
        },
      },
      include: {
        provider: true,
      },
    });
  }

  async findAll() {
    return this.prisma.office.findMany({
      include: {
        provider: true,
      },
    });
  }

  async findByProviderId(providerId: string) {
    return this.prisma.office.findMany({
      where: {
        providerId: providerId,
      },
      include: {
        provider: true,
      },
    });
  }

  async findOne(id: string) {
    const office = await this.prisma.office.findUnique({
      where: { id },
      include: {
        provider: true,
      },
    });

    if (!office) throw new NotFoundException('Office not found');

    return office;
  }
}
