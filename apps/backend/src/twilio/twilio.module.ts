import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controler';
import { TwilioService } from './twilio.service';
import { MulterModule } from '@nestjs/platform-express';
import { VoiceModule } from '../voice/voice.module';

@Module({
  imports: [MulterModule.register(), VoiceModule],
  controllers: [TwilioController],
  providers: [TwilioService],
})
export class TwilioModule {}
