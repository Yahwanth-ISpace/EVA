import { Module } from '@nestjs/common';
import { ElevenLabsService } from './elevenlabs.service';
import { ElevenLabsAudioStackService } from './elevenlabs-audio-stack.service';
import { AudioController } from './audio.controller';

@Module({
  controllers: [AudioController],
  providers: [ElevenLabsService, ElevenLabsAudioStackService],
  exports: [ElevenLabsService, ElevenLabsAudioStackService],
})
export class VoiceModule {}
