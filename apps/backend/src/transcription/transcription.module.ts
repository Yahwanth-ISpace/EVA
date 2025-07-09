import { Module } from '@nestjs/common';
import { TranscriptionService } from './transcription.service';
import { TranscriptionController } from './transcription.controller';
import { AiModule } from '../ai/ai.module'; // to access AiService
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule, AiModule],
  controllers: [TranscriptionController],
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
