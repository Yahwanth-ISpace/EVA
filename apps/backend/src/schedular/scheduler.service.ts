import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ServiceBusClient } from '@azure/service-bus';
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

const today = new Date();

const fromDate = new Date(today);
fromDate.setDate(today.getDate() - 2);

const sabrinaApiUrl =
  process.env.SABRINA_API_URL || 'https://sabrinauatapi.ispace.com/api';

const serviceBusConnectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
const serviceBusQueueName = process.env.SERVICE_BUS_QUEUE_NAME;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private readonly appointmentService: AppointmentService,
    private readonly mongoService: MongoService,
  ) {}
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isProcessing) {
      this.logger.debug('Previous job processing, skipping...');
      return;
    }
    this.isProcessing = true;
    try {
      let appointmentData = await this.getAppointments();
      let finalAppointments: AppointmentDetailsDto;
      let pendingAppointments: AppointmentDetailsDto[] = [];
      this.logger.debug(`Appointment data fetched::: `, appointmentData);
      if (
        appointmentData &&
        !(Array.isArray(appointmentData) && appointmentData.length === 0)
      ) {
        await this.saveRawAppointmentDataToMongo(appointmentData);

        if (appointmentData.benefitsInfo) {
          finalAppointments = appointmentData;
        } else {
          finalAppointments =
            this.transformAppointmentDataToVerificationFields(appointmentData);
        }

        this.logger.debug(
          `Final appointments::: ${JSON.stringify(finalAppointments)}`,
        );
        //save finalAppointments to mongo collection named processed_appointments for reference and debugging
        await this.saveTransformedAppointmentDataToMongo(finalAppointments);

        // clear all verification data from Verification collection where appointmentId and payeeId=patientId in prisma before saving new data by using mongoService
        this.mongoService.deleteVerificationData(
          appointmentData.appointmentId,
          appointmentData.patient.patientId,
        );

        pendingAppointments.push(finalAppointments);
      }

      while (pendingAppointments.length > 0) {
        const agents: AgentDto[] = await this.prisma.agent.findMany({
          where: { status: AgentStatus.COMPLETED },
        });

        if (agents.length > 0) {
          this.logger.debug(`Fetched ${agents.length} available agents.`);
          const count = Math.min(agents.length, pendingAppointments.length);

          for (let i = 0; i < count; i++) {
            const agent = agents[i];
            const appointment = pendingAppointments.shift();
            if (appointment) {
              this.logger.log(
                `Processing appointment for ${appointment.patient.patientName} with agent ${agent.name}`,
              );
              // un comment below lines  call appointment api for each agent and appointment and update agent status to IN_PROGRESS
              const response = this.appointmentService.create(appointment);
              this.logger.log(
                `API Response:::::::: ${JSON.stringify(response)}`,
              );

              await this.callAppointmentApi(agent, appointment);
            }
          }
        } else {
          this.logger.debug('No agents available, waiting...');
        }

        if (pendingAppointments.length > 0) {
          await this.delay(30000); // Wait for 30 seconds before checking again
        }
      }
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
      `Calling appointment API for ${appointment.patient.patientName} with agent ${agent.name}`,
    );
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: AgentStatus.IN_PROGRESS,
        startTime: new Date(),
      },
    });

    await this.appointmentService.create(appointment);
  }

  async loginToSabrina() {
    const loginUrl = `${sabrinaApiUrl}/login/login`;

    const payload = {
      username: process.env.SABRINA_USERNAME,
      password: process.env.SABRINA_PASSWORD,
      verificationCode: process.env.SABRINA_VERIFICATION_CODE || '123456',
    };

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Ocp-Apim-Subscription-Key': process.env.SABRINA_SUBSCRIPTION_KEY,
    };

    try {
      const response = await axios.post(loginUrl, payload, {
        headers,
      });

      return response.data;
    } catch (error: any) {
      this.logger.error(`Status: ${error?.response?.status}`);
      this.logger.error(`Status Text: ${error?.response?.statusText}`);

      this.logger.error(`Axios Message: ${error?.message}`);

      throw error;
    }
  }

  async getAppointments(): Promise<AppointmentDetailsDto | null> {
    try {
      const serviceBusAppointment =
        await this.tryReadAppointmentFromServiceBus();

      this.logger.debug(
        `ServiceBus data: ${JSON.stringify(serviceBusAppointment)}`,
      );

      if (serviceBusAppointment) {
        // Configured static for now. Will change this once Sabrina sends this information.
        serviceBusAppointment.InsuranceCompany_Phone =
          process.env.INSURANCE_COMPANY_PHONENUMBER;
        serviceBusAppointment.InsuranceCompany_Phone_Ext =
          process.env.INSURANCE_COMPANY_PHONENUMBER_EXT;
        serviceBusAppointment.benefitsInfo = process.env.FIELDS_TO_BE_COLLECTED1
          ? JSON.parse(process.env.FIELDS_TO_BE_COLLECTED1)
          : {};

        return serviceBusAppointment as AppointmentDetailsDto;
      }

      this.logger.log('No appointments left to verify.');
      return null;
    } catch (error) {
      this.logger.error(
        'Failed to fetch appointment data',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  parseServiceBusPayload(
    message: Record<string, any>,
  ): Record<string, any> | null {
    const body = message?.body;

    if (body == null) {
      return null;
    }

    if (typeof body === 'string') {
      try {
        return JSON.parse(body) as Record<string, any>;
      } catch {
        return null;
      }
    }

    if (Buffer.isBuffer(body)) {
      try {
        return JSON.parse(body.toString('utf8')) as Record<string, any>;
      } catch {
        return null;
      }
    }

    if (typeof body === 'object') {
      return body as Record<string, any>;
    }

    return null;
  }

  private async tryReadAppointmentFromServiceBus(): Promise<Record<
    string,
    any
  > | null> {
    if (!serviceBusConnectionString || !serviceBusQueueName) {
      this.logger.debug(
        'Azure Service Bus connection settings are not configured. Falling back to the sample API.',
      );
      return null;
    }

    const client = new ServiceBusClient(serviceBusConnectionString);
    const receiver = client.createReceiver(serviceBusQueueName, {
      receiveMode: 'peekLock',
    });

    try {
      const messages = await receiver.receiveMessages(1, {
        maxWaitTimeInMs: 5000,
      });
      const message = messages[0];

      if (!message) {
        return null;
      }

      const payload = this.parseServiceBusPayload(message);
      await receiver.completeMessage(message);
      return payload;
    } catch (error) {
      this.logger.warn(
        'Unable to read appointment data from Azure Service Bus.',
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      await receiver.close();
      await client.close();
    }
  }

  private async saveRawAppointmentDataToMongo(
    appointmentData: Record<string, any>,
  ) {
    const db = await this.mongoService.getDb();
    const collection = db.collection(
      this.mongoService.getSubrinaAppointmentsCollectionName(),
    );

    const appointmentId = appointmentData?.appointmentId as
      | string
      | number
      | undefined;
    const patientId = appointmentData?.patient.patientId as string | undefined;
    if (appointmentId != null && patientId != null) {
      const query = {
        patientId: patientId,
        appointmentId: Number(appointmentId),
      };
      const existing = await collection.findOne(query);

      if (existing) {
        // Delete existing documents for this patient/appointment to ensure a fresh record
        await collection.deleteMany(query);
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

    const appointmentId = appointmentData?.appointmentId as
      | string
      | number
      | undefined;
    const patientId = appointmentData?.patient.patientId as string | undefined;
    if (appointmentId != null && patientId != null) {
      const query = {
        'patient.patientId': patientId,
        appointmentId: Number(appointmentId),
      };
      const existing = await collection.findOne(query);

      if (existing) {
        // Delete existing documents for this patient/appointment to ensure a fresh record
        await collection.deleteMany(query);
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
    // Copy the entire appointment first
    const transformedData: any = { ...appointmentData };

    const verificationFields: VerificationField[] = [];
    let order = 1;

    for (const [key, value] of Object.entries(appointmentData)) {
      // Skip history (handled separately)
      if (key === 'history') continue;
      const history = Array.isArray((appointmentData as any).history)
        ? (appointmentData as any).history
        : [];

      for (const item of history) {
        verificationFields.push({
          field: `history.${item.procedureCode}`,
          question: item.question,
          rule: item.rule,
          order: verificationFields.length + 1,
        });
      }

      // Old question format
      if (typeof value === 'object' && value !== null && 'question' in value) {
        verificationFields.push({
          question: value.question,
          field: key,
          rule: value.rule || '',
          order,
        });

        // Remove the original question object
        delete transformedData[key];

        order++;
      }
    }

    // Handle history
    if (
      Array.isArray(appointmentData.history) &&
      appointmentData.history.length > 0
    ) {
      verificationFields.push({
        question: 'Does this patient have any history?',
        field: 'history-list',
        rule: 'Answer should be "Yes" or "No"',
        order,
      });

      order++;

      for (const historyItem of appointmentData.history) {
        if (historyItem.question && historyItem.procedureCode) {
          verificationFields.push({
            question: historyItem.question,
            field: `history.${historyItem.procedureCode}`,
            procedureCode: historyItem.procedureCode,
            dependencies: historyItem.dependencies ?? [],
            rule: historyItem.rule ?? '',
            order,
          });

          order++;
        }
      }
    }

    transformedData.verificationFields = verificationFields;

    return transformedData as AppointmentDetailsDto;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
