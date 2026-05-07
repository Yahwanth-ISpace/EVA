// Ensure @nestjs/schedule is installed: npm install @nestjs/schedule

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AppointmentModule } from 'src/appointment/appointment.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), AppointmentModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {
  constructor(private readonly schedulerService: SchedulerService) {
    this.schedulerService.handleCron();
  }
}
