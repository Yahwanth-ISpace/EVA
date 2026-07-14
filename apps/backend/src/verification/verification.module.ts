import { Module, forwardRef } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MongoModule } from '../mongo/mongo.module';
import { AiModule } from 'src/ai/ai.module';
import { HttpModule } from '@nestjs/axios';
import { TranscriptionModule } from 'src/transcription/transcription.module';

@Module({
  imports: [
    PrismaModule,
    MongoModule,
    HttpModule,
    forwardRef(() => AiModule),
    TranscriptionModule,
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
