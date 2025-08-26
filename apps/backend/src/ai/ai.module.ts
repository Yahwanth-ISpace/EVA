import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';

@Module({
  controllers: [AiController],
  imports: [ConfigModule.forRoot()],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
