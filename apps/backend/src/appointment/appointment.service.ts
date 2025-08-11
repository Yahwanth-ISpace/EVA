import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { TwilioService } from 'src/twilio/twilio.service';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private prisma: PrismaService,
    private twilioService: TwilioService,
  ) {}

  async create(dto: CreateAppointmentDto) {
    const payee = await this.prisma.payee.findUnique({
      where: { id: dto.payeeId },
    });
    if (!payee) {
      throw new NotFoundException(`Payee with ID ${dto.payeeId} not found`);
    }

    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException(
        `Provider with ID ${dto.providerId} not found`,
      );
    }

    const office = await this.prisma.office.findUnique({
      where: { id: dto.officeId },
    });
    if (!office) {
      throw new NotFoundException(`Office with ID ${dto.officeId} not found`);
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        date: new Date(dto.date),
        notes: dto.notes ?? null,
        payee: { connect: { id: dto.payeeId } },
        provider: { connect: { id: dto.providerId } },
        office: { connect: { id: dto.officeId } },
      },
      include: {
        payee: {
          include: {
            user: true,
            payer: true,
          },
        },
        provider: true,
        office: true,
      },
    });

    const toPhoneNumber =
      `${appointment.payee.payer?.phoneExt}` + appointment.payee.payer?.phone;
    if (toPhoneNumber) {
      await this.twilioService.makeCall(toPhoneNumber, dto.payeeId);
    } else {
      this.logger.warn(
        `No phone number found for Payer linked to Payee ID ${dto.payeeId}`,
      );
    }

    return appointment;
  }

  async findAll(user: { userId: string; role: 'ADMIN' | 'PAYEE' }) {
    if (user.role === 'ADMIN') {
      return this.prisma.appointment.findMany({
        include: {
          payee: {
            include: {
              user: true, // to verify if the requester is the payee
              payer: true, // Include payer details to verify payee Benfits
            },
          },
          provider: true,
          office: true,
        },
        orderBy: {
          date: 'asc',
        },
      });
    }

    // PAYEE ROLE
    const payee = await this.prisma.payee.findUnique({
      where: { userId: user.userId },
    });

    if (!payee) {
      throw new Error(`Payee record not found for user ID ${user.userId}`);
    }

    return this.prisma.appointment.findMany({
      where: {
        payeeId: payee.id,
      },
      include: {
        payee: {
          include: {
            user: true, // to verify if the requester is the payee
            payer: true, // Include payer details to verify payee Benfits
          },
        },
        provider: true,
        office: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  async findOne(id: string, user: { id: string; role: 'ADMIN' | 'PAYEE' }) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        payee: {
          include: {
            user: true, // to verify if the requester is the payee
            payer: true, // Include payer details to verify payee Benfits
          },
        },
        provider: true,
        office: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    if (user.role === 'PAYEE') {
      if (appointment.payee?.user?.id !== user.id) {
        throw new ForbiddenException('Access denied to this appointment');
      }
    }

    return appointment;
  }
}
