import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioService } from 'src/twilio/twilio.service';
import { AppointmentDetailsDto } from './dto/appointment-details.dto';
import { MongoService } from 'src/mongo/mongo.service';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilioService: TwilioService,
    private readonly mongoService: MongoService,
  ) {}

  async create(appointment: AppointmentDetailsDto) {
    this.logger.debug(`Creating appointment: ${JSON.stringify(appointment)}`);

    const phone = (appointment.InsuranceCompany_Phone ?? '').trim();
    const ext = (appointment.InsuranceCompany_Phone_Ext ?? '').trim();
    const toPhoneNumber = ext ? `${ext}${phone}` : phone;

    if (toPhoneNumber) {
      this.logger.log(`Initiating verification call to ${toPhoneNumber}`);

      await this.twilioService.makeCall(
        toPhoneNumber,
        appointment.patient.patientId,
        String(appointment.appointmentId),
        {
          navigateTpaIvr: process.env.EVA_NAVIGATE_TPA_IVR === 'true',
        },
      );
    } else {
      this.logger.warn(
        `Insurance phone number missing for Patient ${appointment.patient.patientId}`,
      );
    }

    return appointment;
  }

  private userDobToYmd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  async findAll(user: { userId: string; role: 'ADMIN' | 'PAYEE' }) {
    const col = await this.mongoService.appointmentsCollection();

    if (user.role === 'ADMIN') {
      return col
        .find({})
        .sort({
          appointmentDate: 1,
          savedAt: -1,
        })
        .toArray();
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        firstName: true,
        lastName: true,
        dob: true,
      },
    });

    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    const dobYmd = dbUser.dob ? this.userDobToYmd(dbUser.dob) : undefined;

    const patientIds = await this.mongoService.findPatientIdsByUserProfile(
      dbUser.firstName,
      dbUser.lastName,
      dobYmd,
    );

    if (!patientIds.length) {
      return [];
    }

    return col
      .find({
        'patient.patientId': {
          $in: patientIds,
        },
      })
      .sort({
        appointmentDate: 1,
        savedAt: -1,
      })
      .toArray();
  }

  async findOne(id: string, user: { userId: string; role: 'ADMIN' | 'PAYEE' }) {
    const col = await this.mongoService.appointmentsCollection();

    const doc =
      id.length === 24 && ObjectId.isValid(id)
        ? await col.findOne({
            _id: new ObjectId(id),
          })
        : await col.findOne({
            $or: [
              {
                'patient.patientId': id,
              },
              {
                appointmentId: Number(id),
              },
              {
                appointmentId: id,
              },
            ],
          });

    if (!doc) {
      throw new NotFoundException('Appointment not found');
    }

    if (user.role === 'PAYEE') {
      const dbUser = await this.prisma.user.findUnique({
        where: {
          id: user.userId,
        },
        select: {
          firstName: true,
          lastName: true,
          dob: true,
        },
      });

      if (!dbUser) {
        throw new NotFoundException('User not found');
      }

      const dobYmd = dbUser.dob ? this.userDobToYmd(dbUser.dob) : undefined;

      const allowedPatientIds =
        await this.mongoService.findPatientIdsByUserProfile(
          dbUser.firstName,
          dbUser.lastName,
          dobYmd,
        );

      const patientId = String(doc.patient?.patientId ?? '');

      if (!allowedPatientIds.includes(patientId)) {
        throw new ForbiddenException('Access denied to this appointment');
      }
    }

    return doc;
  }
}
