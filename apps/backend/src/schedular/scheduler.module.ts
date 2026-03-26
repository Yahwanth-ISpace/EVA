// Ensure @nestjs/schedule is installed: npm install @nestjs/schedule

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [SchedulerService],
})
export class SchedulerModule {
  constructor(private readonly schedulerService: SchedulerService) {
    this.schedulerService.handleCron();
  }
}
