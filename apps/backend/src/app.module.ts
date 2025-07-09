// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { PatientModule } from './patient/patient.module';
import { VerificationModule } from './verification/verification.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PatientModule,
    VerificationModule,
    AiModule,
    AuthModule,
    UserModule,
  ],
})
export class AppModule {}
