import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { AgentStatus } from '@prisma/client';
import { AgentDto } from './dto/agent.dto';
import {
  AppointmentDetailsDto,
  VerificationField,
} from 'src/appointment/dto/appointment-details.dto';
import { AppointmentService } from 'src/appointment/appointment.service';
import { MongoService } from 'src/mongo/mongo.service';

// Ensure @nestjs/schedule is installed: npm install @nestjs/schedule

const noOfAgents = process.env.NO_OF_AGENTS
  ? parseInt(process.env.NO_OF_AGENTS)
  : 1;

const sampleDataApiUrl =
  process.env.SAMPLE_DATA_API_URL ||
  'http://localhost:3000/scheduler/sample-data';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private readonly appointmentService: AppointmentService,
    private readonly mongoService: MongoService,
  ) {}
  // @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isProcessing) {
      this.logger.debug('Previous job processing, skipping...');
      return;
    }
    this.isProcessing = true;
    try {
      let appointmentData = await this.getAppointments();
      this.logger.debug(
        `Appointment data fetched::: ${JSON.stringify(appointmentData)}`,
      );
      await this.saveRawAppointmentDataToMongo(appointmentData);

      let finalAppointments =
        this.transformAppointmentDataToVerificationFields(appointmentData);

      this.logger.debug(
        `Final appointments::: ${JSON.stringify(finalAppointments)}`,
      );
      //save finalAppointments to mongo collection named processed_appointments for reference and debugging
      await this.saveTransformedAppointmentDataToMongo(finalAppointments);
      // comment below 2 lines after actually calling
      const response = await this.appointmentService.create(finalAppointments);
      this.logger.log(`API Response:::::::: ${JSON.stringify(response)}`);

      const pendingAppointments = [finalAppointments];

      // while (pendingAppointments.length > 0) {
      //   const agents: AgentDto[] = await this.prisma.agent.findMany({
      //     where: { status: AgentStatus.COMPLETED },
      //   });

      //   if (agents.length > 0) {
      //     this.logger.debug(`Fetched ${agents.length} available agents.`);
      //     const count = Math.min(agents.length, pendingAppointments.length);

      //     for (let i = 0; i < count; i++) {
      //       const agent = agents[i];
      //       const appointment = pendingAppointments.shift();
      //       if (appointment) {
      //         this.logger.log(
      //           `Processing appointment for ${appointment.Patient_FirstName} ${appointment.Patient_LastName} with agent ${agent.name}`,
      //         );
      //         // un comment below lines  call appointment api for each agent and appointment and update agent status to IN_PROGRESS
      //         // const response = this.appointmentService.create(appointment);
      //         // this.logger.log(`API Response:::::::: ${JSON.stringify(response.data)}`);

      //         await this.callAppointmentApi(agent, appointment);
      //       }
      //     }
      //   } else {
      //     this.logger.debug('No agents available, waiting...');
      //   }

      //   if (pendingAppointments.length > 0) {
      //     await this.delay(30000); // Wait for 30 seconds before checking again
      //   }
      // }
    } catch (error) {
      this.logger.error(
        'Failed to call appointment list API',
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  async callAppointmentApi(
    agent: AgentDto,
    appointment: AppointmentDetailsDto,
  ) {
    this.logger.log(
      `Calling appointment API for ${appointment.Patient_FirstName} ${appointment.Patient_LastName} with agent ${agent.name}`,
    );
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { status: AgentStatus.IN_PROGRESS, startTime: new Date() },
    });
  }

  async getAppointments() {
    try {
      this.logger.log(
        'Fetching appointment data from API...',
        sampleDataApiUrl,
      );
      const response = await axios.get<any>(sampleDataApiUrl);
      this.logger.debug(`Appointment data: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        'Failed to fetch appointment data from API',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  private async saveRawAppointmentDataToMongo(
    appointmentData: Record<string, any>,
  ) {
    const db = await this.mongoService.getDb();
    const collection = db.collection('subrina_appointments');

    const appointmentId = appointmentData?.AppointmentID;
    const patientId = appointmentData?.PatientID;
    if (appointmentId != null && patientId != null) {
      const existing = await collection.findOne({
        AppointmentID: appointmentId,
        PatientID: patientId,
      });

      if (existing) {
        this.logger.log(
          `Appointment data already exists in MongoDB for AppointmentID=${appointmentId}, PatientID=${patientId}`,
        );
        return existing;
      }
    }

    const document = {
      ...appointmentData,
      savedAt: new Date(),
      source: 'scheduler',
    };
    const result = await collection.insertOne(document);
    this.logger.log(
      `Saved raw appointment data to MongoDB: ${result.insertedId}`,
    );
    return result;
  }

  private async saveTransformedAppointmentDataToMongo(
    appointmentData: Record<string, any>,
  ) {
    const collection = await this.mongoService.appointmentsCollection();

    const appointmentId = appointmentData?.AppointmentID;
    const patientId = appointmentData?.PatientID;
    if (appointmentId != null && patientId != null) {
      const existing = await collection.findOne({
        AppointmentID: appointmentId,
        PatientID: patientId,
      });

      if (existing) {
        this.logger.log(
          `Appointment data already exists in MongoDB for AppointmentID=${appointmentId}, PatientID=${patientId}`,
        );
        return existing;
      }
    }

    const document = {
      ...appointmentData,
      savedAt: new Date(),
      source: 'scheduler',
    };
    const result = await collection.insertOne(document);
    this.logger.log(
      `Saved raw appointment data to MongoDB: ${result.insertedId}`,
    );
    return result;
  }

  transformAppointmentDataToVerificationFields(
    appointmentData: Record<string, any>,
  ): AppointmentDetailsDto {
    const transformedData: any = {};
    const verificationFields: VerificationField[] = [];
    let order = 1;

    for (const [key, value] of Object.entries(appointmentData)) {
      // Skip the 'history' array and known object keys
      if (key === 'history') continue;

      if (typeof value === 'object' && value !== null && 'question' in value) {
        verificationFields.push({
          question: value?.question,
          field: key,
          order: order,
        });
        order++;
      } else if (typeof value === 'string' || typeof value === 'number') {
        transformedData[key] = value;
      }
    }

    // Process history array and add to verificationFields
    if (appointmentData.history && Array.isArray(appointmentData.history)) {
      for (const historyItem of appointmentData.history) {
        if (historyItem.question && historyItem.procedurecode) {
          verificationFields.push({
            question: historyItem.question,
            field: `history.${historyItem.procedurecode}`,
            order: order,
          });
          order++;
        }
      }
    }

    transformedData['verificationFields'] = verificationFields;
    return transformedData;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
