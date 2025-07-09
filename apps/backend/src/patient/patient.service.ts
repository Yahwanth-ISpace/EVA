import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePatientDto) {
    return this.prisma.patient.create({ data });
  }

  findAll() {
    return this.prisma.patient.findMany({
      include: { verifications: true },
    });
  }

  findOne(id: string) {
    return this.prisma.patient.findUnique({
      where: { id },
      include: { verifications: true },
    });
  }
}
