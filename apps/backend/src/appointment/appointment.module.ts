import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MongoModule } from 'src/mongo/mongo.module';
import { TwilioService } from 'src/twilio/twilio.service';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { VerificationModule } from 'src/verification/verification.module';

@Module({
  imports: [PrismaModule, MongoModule, forwardRef(() => VerificationModule)],
  controllers: [AppointmentController],
  providers: [AppointmentService, TwilioService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
