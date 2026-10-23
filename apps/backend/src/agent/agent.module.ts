import { Module } from '@nestjs/common';
import { MongoModule } from '../mongo/mongo.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [MongoModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
