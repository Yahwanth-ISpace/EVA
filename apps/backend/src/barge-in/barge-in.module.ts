import { Module } from '@nestjs/common';

import { BargeInController } from './barge-in.controller';
import { BargeInService } from './barge-in.service';
import { MediaStreamHandlerService } from 'src/twilio/media-stream.handler';

@Module({
  controllers: [BargeInController],

  providers: [BargeInService, MediaStreamHandlerService],

  exports: [BargeInService],
})
export class BargeInModule {}
