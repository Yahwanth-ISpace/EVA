import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayeeDto } from './dto/create-payee.dto';

@Injectable()
export class PayeeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePayeeDto | undefined) {
    if (!data) throw new BadRequestException('Missing payee data');

    const { payer, ...rest } = data;

    const prismaData: any = {
      ...rest,
      dob: data.dob ?? null,
    };

    if (payer?.id) {
      prismaData.payer = {
        connectOrCreate: {
          where: { id: payer.id },
          create: { ...payer },
        },
      };
    }

    return this.prisma.payee.create({ data: prismaData });
  }

  async findAll() {
    return this.prisma.payee.findMany({
      include: {
        payer: true,
        user: true,
        verifications: true,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.payee.findUnique({
      where: { id },
      include: {
        payer: true,
        user: true,
        verifications: true,
      },
    });
  }

  async update(id: string, data: Partial<CreatePayeeDto>) {
    const existing = await this.prisma.payee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Payee not found');
    }

    const { payer, ...rest } = data;

    const updateData: any = {
      ...rest,
      dob: data.dob ?? null,
    };

    if (payer?.id) {
      updateData.payer = {
        connect: { id: payer.id },
      };
    }

    return this.prisma.payee.update({
      where: { id },
      data: updateData,
      include: {
        payer: true,
        user: true,
        verifications: true,
      },
    });
  }
}
