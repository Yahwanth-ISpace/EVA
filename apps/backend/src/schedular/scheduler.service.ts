import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { AgentStatus } from '@prisma/client';
import { AgentDto } from './dto/agent.dto';

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
const appointmentListApiUrl =
  process.env.APPOINTMENT_LIST_API_URL ||
  'https://unsocial-spud-entrap.ngrok-free.dev/appointments';
const appointmentApiToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzYjgyODIwNC0zMDg2LTQ5ZjgtOGJiZC01YTlkODdkZjcxNTYiLCJlbWFpbCI6InRlZW5hQGRlbnRhbHMuY29tIiwicm9sZSI6IlBBWUVFIiwiZmlyc3ROYW1lIjoiVGVlbmEiLCJsYXN0TmFtZSI6IlN0b25lIiwiZG9iIjoiMjAwMi0wMS0zMVQwMDowMTowMC4wMDBaIiwiaWF0IjoxNzc4MDY5MzM3LCJleHAiOjE3NzgxNTU3Mzd9.S-LCl3EwlQc_4ecqw7DaVUR2lDW65wgkd2chUVETNDw';
const sampleDataApiUrl =
  process.env.SAMPLE_DATA_API_URL ||
  'http://localhost:3000/scheduler/sample-data';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private isProcessing = false;

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
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
      this.logger.debug(
        `Final appointments::: ${JSON.stringify(finalAppointments)}`,
      );
      finalAppointments['payeeId'] = '68b4a6b8-778e-49c6-8efe-3021147060d5';
      finalAppointments['providerId'] = 'be4d0277-3ba3-4948-923f-6e40855087e7';

      const response = await axios.post<Appointment[]>(
        appointmentListApiUrl,
        finalAppointments,
        {
          headers: { Authorization: `Bearer ${appointmentApiToken}` },
        },
      );
      this.logger.debug('Successfully called appointment list API');
      this.logger.log(`API Response:::::::: ${JSON.stringify(response.data)}`);

      const appointments = response.data;
      this.logger.debug(`respnose:::: ${response}, 
            Fetched ${appointments.length} appointments from API`);

      const pendingAppointments = [...appointments];

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
              //   call appointment api for each agent and appointment and update agent status to IN_PROGRESS
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
      const response = await axios.get<Appointment[]>(sampleDataApiUrl, {
        headers: { Authorization: `Bearer ${appointmentApiToken}` },
      });
      this.logger.log('Successfully fetched appointment data from API');
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
  ) {
    const verificationFields: Array<{
      question: string;
      field: string;
      order: number;
    }> = [];
    let order = 1;

    for (const [key, value] of Object.entries(appointmentData)) {
      // Skip the 'history' array
      if (key === 'history') continue;

      if (typeof value === 'object' && value !== null && 'question' in value) {
        verificationFields.push({
          question: value?.question,
          field: key,
          order: order,
        });
        order++;
      }
    }

    return { verificationFields };
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
