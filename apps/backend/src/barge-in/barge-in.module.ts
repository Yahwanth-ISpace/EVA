import { Module } from '@nestjs/common';

import { BargeInController } from './barge-in.controller';
import { BargeInService } from './barge-in.service';

import { TwilioModule } from 'src/twilio/twilio.module';
import { TranscriptionModule } from 'src/transcription/transcription.module';

@Module({
  imports: [
    TranscriptionModule,
    TwilioModule,
  ],
  controllers: [BargeInController],
  providers: [BargeInService],
  exports: [BargeInService],
})
export class BargeInModule {}