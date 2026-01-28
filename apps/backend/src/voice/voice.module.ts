import { Module } from '@nestjs/common';
import { ElevenLabsService } from './elevenlabs.service';
import { ElevenLabsAudioStackService } from './elevenlabs-audio-stack.service';

@Module({
  providers: [ElevenLabsService, ElevenLabsAudioStackService],
  exports: [ElevenLabsService, ElevenLabsAudioStackService],
})
export class VoiceModule {}
