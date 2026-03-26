// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { PayeeModule } from './payee/payee.module';
import { VerificationModule } from './verification/verification.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PayerModule } from './payer/payer.module';
import { AppointmentModule } from './appointment/appointment.module';
import { OfficeModule } from './offices/office.module';
import { ProviderModule } from './providers/provider.module';
import { TwilioModule } from './twilio/twilio.module';
import { VerificationRequirementModule } from './verification-requirement/verification-requirement.module';
import { ChatModule } from './chat/chat.module';
import { SchedulerModule } from './schedular/scheduler.module';
import { BotTrackerModule } from './bot-tracker/bot-tracker.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PayeeModule,
    ProviderModule,
    AppointmentModule,
    OfficeModule,
    PayerModule,
    VerificationModule,
    VerificationRequirementModule,
    AiModule,
    AuthModule,
    UserModule,
    TwilioModule,
    ChatModule,
    SchedulerModule,
    BotTrackerModule,
  ],
})
export class AppModule {}
