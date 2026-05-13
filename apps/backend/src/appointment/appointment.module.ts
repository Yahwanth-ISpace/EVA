import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MongoModule } from 'src/mongo/mongo.module';
import { TwilioService } from 'src/twilio/twilio.service';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';

@Module({
  imports: [PrismaModule, MongoModule],
  controllers: [AppointmentController],
  providers: [AppointmentService, TwilioService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
