import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Document, ObjectId } from 'mongodb';
import { TwilioService } from 'src/twilio/twilio.service';
import { AppointmentDetailsDto } from './dto/appointment-details.dto';
import { MongoService } from 'src/mongo/mongo.service';
import { mapMongoAppointmentToClient } from './appointment.mapper';
import { VerificationService } from 'src/verification/verification.service';

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly twilioService: TwilioService,
    private readonly mongoService: MongoService,
    private readonly verificationService: VerificationService,
  ) {}

  async create(appointment: AppointmentDetailsDto, agentId: string) {
    this.logger.debug(
      `Creating appointment ${appointment.appointmentId} for patient ${appointment.patient?.patientId}`,
    );

    const phone = (appointment.InsuranceCompany_Phone ?? '').trim();
    const ext = (appointment.InsuranceCompany_Phone_Ext ?? '').trim();
    const toPhoneNumber = ext ? `${ext}${phone}` : phone;

    if (toPhoneNumber) {
      this.logger.log(`Initiating verification call to ${toPhoneNumber}`);

      await this.twilioService.makeCall(
        toPhoneNumber,
        appointment.patient.patientId,
        agentId,
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

  async findAll() {
    const col = await this.mongoService.appointmentsCollection();
    const docs = await col
      .find({})
      .sort({
        appointmentDate: 1,
        savedAt: -1,
      })
      .toArray();
    const sealed: Document[] = [];
    for (const doc of docs) {
      sealed.push(await this.mongoService.sealAppointmentSsns(col, doc));
    }
    return sealed.map((d) =>
      mapMongoAppointmentToClient(d as Record<string, unknown>),
    );
  }

  async findOne(id: string) {
    const col = await this.mongoService.appointmentsCollection();
    const doc = await this.findAppointmentDocument(col, id);
    if (!doc) throw new NotFoundException('Appointment not found');
    await this.mongoService.sealAppointmentSsns(col, doc);
    return mapMongoAppointmentToClient(doc as Record<string, unknown>);
  }

  async remove(id: string) {
    const col = await this.mongoService.appointmentsCollection();
    const doc = await this.findAppointmentDocument(col, id);
    if (!doc) throw new NotFoundException('Appointment not found');
    await col.deleteOne({ _id: doc._id });
    return { deleted: true, id };
  }

  private async findAppointmentDocument(
    col: Awaited<ReturnType<MongoService['appointmentsCollection']>>,
    id: string,
  ) {
    if (id.length === 24 && ObjectId.isValid(id)) {
      return col.findOne({ _id: new ObjectId(id) });
    }
    return col.findOne({
      $or: [
        { 'patient.patientId': id },
        { appointmentId: Number(id) },
        { appointmentId: id },
      ],
    });
  }

  async saveEligibilityToSabrina(
    id: string,
    user: { userId: string; role: 'ADMIN' | 'OPERATOR' },
    extractedData: Record<string, string | null | undefined>,
  ) {
    const appt = await this.findOne(id);
    const record = appt as Record<string, unknown>;
    const payeeId = String(
      record.payeeId ?? (record.patient as { patientId?: string })?.patientId ?? '',
    ).trim();
    if (!payeeId) {
      throw new BadRequestException('Patient id missing on appointment');
    }
    const appointmentId =
      record.appointmentId != null ? String(record.appointmentId) : undefined;
    const transcript =
      typeof (record.eva as { transcript?: string } | undefined)?.transcript ===
      'string'
        ? (record.eva as { transcript: string }).transcript
        : undefined;

    return this.verificationService.saveEligibilityToSabrina(
      payeeId,
      appointmentId,
      extractedData,
      transcript,
    );
  }

  async updateEvaVerification(
    patientId: string,
    appointmentId: string,
    data: {
      extractedData?: Record<string, any>;
      transcript?: string;
      status?: string;
      callSid?: string | null;
      startedAt?: Date | null;
      endedAt?: Date | null;
      duration?: number | null;
    },
  ) {
    if (!patientId) {
      throw new BadRequestException('patientId is required');
    }

    if (!appointmentId) {
      throw new BadRequestException('appointmentId is required');
    }

    const col = await this.mongoService.appointmentsCollection();

    const appointment = await col.findOne({
      'patient.patientId': patientId,
      appointmentId: Number(appointmentId),
    });

    if (!appointment) {
      throw new NotFoundException(
        'Appointment not found for patient and appointmentId',
      );
    }

    const currentEva = appointment.eva ?? {};

    const currentExtracted = currentEva.extractedData ?? {};

    const mergedExtracted = {
      ...currentExtracted,
      ...(data.extractedData ?? {}),
    };

    const evaUpdate = {
      ...currentEva,
      ...data,
      extractedData: mergedExtracted,
    };

    delete (evaUpdate as any).appointmentId;

    await col.updateOne(
      {
        _id: appointment._id,
      },
      {
        $set: {
          eva: evaUpdate,
        },
      },
    );

    return col.findOne({
      _id: appointment._id,
    });
  }
}
