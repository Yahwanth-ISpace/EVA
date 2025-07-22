import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controler';
import { TwilioService } from './twilio.service';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [MulterModule.register()],
  controllers: [TwilioController],
  providers: [TwilioService],
})
export class TwilioModule {}
