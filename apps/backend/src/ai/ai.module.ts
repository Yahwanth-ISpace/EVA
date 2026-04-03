import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiService } from './ai.service';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { VerificationModule } from '../verification/verification.module';

@Module({
  controllers: [AiController],
  imports: [
    ConfigModule.forRoot(),
    HttpModule,
    forwardRef(() => VerificationModule),
  ],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
