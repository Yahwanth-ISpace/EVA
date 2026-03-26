import { Module } from '@nestjs/common';
import { BotTrackerService } from './bot-tracker.service';
import { BotTrackerController } from './bot-tracker.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  controllers: [BotTrackerController],
  imports: [PrismaModule],
  providers: [BotTrackerService, PrismaService],
  exports: [BotTrackerService],
})
export class BotTrackerModule {}
