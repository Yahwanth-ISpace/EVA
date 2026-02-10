import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controler';
import { TwilioService } from './twilio.service';
import { MediaStreamHandlerService } from './media-stream.handler';
import { MulterModule } from '@nestjs/platform-express';
import { VoiceModule } from '../voice/voice.module';
import { AiModule } from '../ai/ai.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [
    MulterModule.register(),
    VoiceModule,
    AiModule,
    TranscriptionModule,
    VerificationModule,
  ],
  controllers: [TwilioController],
  providers: [TwilioService, MediaStreamHandlerService],
  exports: [MediaStreamHandlerService],
})
export class TwilioModule {}
