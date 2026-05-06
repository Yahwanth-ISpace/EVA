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
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzYjgyODIwNC0zMDg2LTQ5ZjgtOGJiZC01YTlkODdkZjcxNTYiLCJlbWFpbCI6InRlZW5hQGRlbnRhbHMuY29tIiwicm9sZSI6IlBBWUVFIiwiZmlyc3ROYW1lIjoiVGVlbmEiLCJsYXN0TmFtZSI6IlN0b25lIiwiZG9iIjoiMjAwMi0wMS0zMVQwMDowMTowMC4wMDBaIiwiaWF0IjoxNzc0NTEwMTk5LCJleHAiOjE3NzQ1OTY1OTl9.FI5fRiUfD3IUCHqHlfiNL7OkzODYJh_fnZPR1TK3lDQ';
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
      let sampleData = await this.getSampleData();
      this.logger.debug(`Sample data fetched::: ${JSON.stringify(sampleData)}`);

      const response = await axios.get<Appointment[]>(appointmentListApiUrl, {
        headers: { Authorization: `Bearer ${appointmentApiToken}` },
      });
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

  async getSampleData() {
    try {
      this.logger.log('Fetching sample data from API...', sampleDataApiUrl);
      const response = await axios.get<Record<string, any>>(sampleDataApiUrl);
      this.logger.log('Successfully fetched sample data from API');
      this.logger.debug(`Sample data: ${JSON.stringify(response.data)}`);
      return response;
    } catch (error) {
      this.logger.error(
        'Failed to fetch sample data from API',
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
