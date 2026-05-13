import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
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
    private prisma: PrismaService,
    private twilioService: TwilioService,
    private readonly mongoService: MongoService,
  ) {}

  async create(appointment: AppointmentDetailsDto) {
    this.logger.debug(
      `Creating appointment with data: ${JSON.stringify(appointment)}`,
    );

    const phone = (appointment.InsuranceCompany_Phone ?? '').trim();
    const ext = (appointment.InsuranceCompany_Phone_Ext ?? '').trim();
    const toPhoneNumber = ext ? `${ext}${phone}` : phone;

    if (toPhoneNumber) {
      this.logger.debug(`Making call to: ${toPhoneNumber}`);
      await this.twilioService.makeCall(
        toPhoneNumber,
        appointment.PatientID,
        String(appointment.AppointmentID),
        {
          navigateTpaIvr: process.env.EVA_NAVIGATE_TPA_IVR === 'true',
        },
      );
    } else {
      this.logger.warn(
        `No phone number on appointment for PatientID ${appointment.PatientID}`,
      );
    }

    return appointment;
  }

  private userDobToYmd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  async findAll(user: { userId: string; role: 'ADMIN' | 'PAYEE' }) {
    if (user.role === 'ADMIN') {
      return this.mongoService.findAllAppointmentsSorted();
    }

    const u = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true, dob: true },
    });
    if (!u) {
      throw new Error(`User not found for id ${user.userId}`);
    }

    const dobYmd = u.dob ? this.userDobToYmd(u.dob) : undefined;
    const patientIds = await this.mongoService.findPatientIdsByUserProfile(
      u.firstName,
      u.lastName,
      dobYmd,
    );
    if (patientIds.length === 0) {
      return [];
    }

    const col = await this.mongoService.appointmentsCollection();
    return col
      .find({ PatientID: { $in: patientIds } })
      .sort({ AppointmentDate: 1, savedAt: 1 })
      .toArray();
  }

  async findOne(id: string, user: { userId: string; role: 'ADMIN' | 'PAYEE' }) {
    const col = await this.mongoService.appointmentsCollection();
    const doc =
      id.length === 24 && ObjectId.isValid(id)
        ? await col.findOne({ _id: new ObjectId(id) })
        : await col.findOne({
            $or: [{ PatientID: id }, this.mongoService.appointmentIdQuery(id)],
          });

    if (!doc) {
      throw new NotFoundException('Appointment not found');
    }

    if (user.role === 'PAYEE') {
      const u = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, dob: true },
      });
      const dobYmd = u?.dob ? this.userDobToYmd(u.dob) : undefined;
      const allowed = await this.mongoService.findPatientIdsByUserProfile(
        u?.firstName,
        u?.lastName,
        dobYmd,
      );
      const pid = String(doc.PatientID ?? '');
      if (!allowed.includes(pid)) {
        throw new ForbiddenException('Access denied to this appointment');
      }
    }

    return doc;
  }
}
