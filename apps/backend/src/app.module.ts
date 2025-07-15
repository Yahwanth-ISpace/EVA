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
    AiModule,
    AuthModule,
    UserModule,
  ],
})
export class AppModule {}
