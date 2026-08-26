import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controler';
import { TwilioService } from './twilio.service';
import { MediaStreamHandlerService } from './media-stream.handler';
import { MulterModule } from '@nestjs/platform-express';
import { VoiceModule } from '../voice/voice.module';
import { AiModule } from '../ai/ai.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { VerificationModule } from '../verification/verification.module';
import { VerificationRequirementModule } from '../verification-requirement/verification-requirement.module';
import { BotTrackerModule } from '../bot-tracker/bot-tracker.module';
import { AudioEmotionModule } from '../audio-emotion/audio-emotion.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    MulterModule.register(),
    PrismaModule,
    VoiceModule,
    AiModule,
    TranscriptionModule,
    VerificationModule,
    VerificationRequirementModule,
    BotTrackerModule,
    AudioEmotionModule,
  ],
  controllers: [TwilioController],
  providers: [TwilioService, MediaStreamHandlerService],
  exports: [MediaStreamHandlerService],
})
export class TwilioModule {}
