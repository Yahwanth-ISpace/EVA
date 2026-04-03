import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AudioEmotionService } from './audio-emotion.service';

@Module({
  imports: [HttpModule],
  providers: [AudioEmotionService],
  exports: [AudioEmotionService],
})
export class AudioEmotionModule {}
