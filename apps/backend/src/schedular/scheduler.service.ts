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

// Ensure @nestjs/schedule is installed: npm install @nestjs/schedule

export interface ProviderDetails {
  payeeId: string;
  providerId: string;
  officeId: string;
  date: string;
  notes: string;
}

export interface Appointment {
  patiantName: string;
  PatiantDOB: string;
  providerDetails: ProviderDetails;
}

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
      let finalAppointments =
        this.transformAppointmentDataToVerificationFields(appointmentData);

      finalAppointments['payeeId'] = '68b4a6b8-778e-49c6-8efe-3021147060d5';
      finalAppointments['providerId'] = 'be4d0277-3ba3-4948-923f-6e40855087e7';

      this.logger.debug(
        `Final appointments::: ${JSON.stringify(finalAppointments)}`,
      );
      // comment below 2 lines after actually calling
      const response = this.appointmentService.create(appointment);
      this.logger.log(`API Response:::::::: ${JSON.stringify(response.data)}`);

      const pendingAppointments = [...finalAppointments];

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
                `Processing appointment for ${appointment.patiantName} with agent ${agent.name}`,
              );
              // un comment below lines  call appointment api for each agent and appointment and update agent status to IN_PROGRESS
              // const response = this.appointmentService.create(appointment);
              // this.logger.log(`API Response:::::::: ${JSON.stringify(response.data)}`);

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

  async callAppointmentApi(agent: any, appointment: Appointment) {
    this.logger.log(
      `Calling appointment API for ${appointment.patiantName} with agent ${agent.name}`,
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
      const response = await axios.get<Appointment[]>(sampleDataApiUrl);
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

  transformAppointmentDataToVerificationFields(
    appointmentData: Record<string, any>,
  ): AppointmentDetailsDto {
    const verificationFields: VerificationField[] = [];
    let order = 1;

    for (const [key, value] of Object.entries(appointmentData)) {
      // Skip the 'history' array and known object keys
      if (
        key === 'history' ||
        key === 'general_details' ||
        key === 'patient_details' ||
        key === 'insurance_details' ||
        key === 'insurance_group' ||
        key === 'provider_facility_details' ||
        key === 'calling_script'
      )
        continue;

      if (typeof value === 'object' && value !== null && 'question' in value) {
        verificationFields.push({
          question: value?.question,
          field: key,
          order: order,
        });
        order++;
      }
    }

    return {
      general_details: appointmentData?.general_details || {},
      patient_details: appointmentData?.patient_details || {},
      insurance_details: appointmentData?.insurance_details || {},
      insurance_group: appointmentData?.insurance_group || {},
      provider_facility_details:
        appointmentData?.provider_facility_details || {},
      calling_script: appointmentData?.calling_script || {},
      verificationFields,
    };
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
