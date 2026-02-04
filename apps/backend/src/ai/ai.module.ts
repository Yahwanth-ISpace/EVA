import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { VerificationModule } from '../verification/verification.module';

@Module({
  controllers: [AiController],
  imports: [
    ConfigModule.forRoot(),
    forwardRef(() => VerificationModule),
  ],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
