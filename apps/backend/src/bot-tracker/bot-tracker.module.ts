import { Module } from '@nestjs/common';
import { BotTrackerService } from './bot-tracker.service';
import { BotTrackerController } from './bot-tracker.controller';
import { MongoModule } from 'src/mongo/mongo.module';

@Module({
  controllers: [BotTrackerController],
  imports: [MongoModule],
  providers: [BotTrackerService],
  exports: [BotTrackerService],
})
export class BotTrackerModule {}
