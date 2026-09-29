import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [PrismaModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
