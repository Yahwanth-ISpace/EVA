import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';

@Injectable()
export class ProviderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProviderDto) {
    return this.prisma.provider.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        npi: dto.npi,
        network: dto.network,
        specialty: dto.specialty
        // Offices should be created separately with providerId
      },
      include: {
        offices: true // show associated offices if any
      }
    });
  }

  async findAll() {
    return this.prisma.provider.findMany({
      include: {
        offices: true
      }
    });
  }

  async findOne(id: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      include: {
        offices: true
      }
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return provider;
  }
}
