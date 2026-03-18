import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';

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

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor() {}

  @Cron(CronExpression.EVERY_1_MINUTE)
  async handleCron() {
    this.logger.debug('Called every 1 minute..............');
    console.log('Called every 1 minute..............');
    try {
      const response = await axios.get<Appointment[]>(
        'http://localhost:3000/assets/appointmentlist.json',
      );
      this.logger.debug('Successfully called appointment list API');
      this.logger.log(`API Response:::::::: ${JSON.stringify(response.data)}`);
      console.log(`API Response::::::::::: ${JSON.stringify(response.data)}`);
    } catch (error) {
      this.logger.error(
        'Failed to call appointment list API',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
