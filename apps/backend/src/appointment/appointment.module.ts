import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TwilioService } from 'src/twilio/twilio.service';
import { BotTrackerModule } from 'src/bot-tracker/bot-tracker.module';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';

@Module({
  imports: [PrismaModule, BotTrackerModule],
  controllers: [AppointmentController],
  providers: [AppointmentService, TwilioService],
})
export class AppointmentModule {}
