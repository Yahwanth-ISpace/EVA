import { Module } from '@nestjs/common';
import { VerificationRequirementService } from './verification-requirement.service';
import { VerificationRequirementController } from './verification-requirement.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MongoModule } from '../mongo/mongo.module';

@Module({
  imports: [PrismaModule, MongoModule],
  controllers: [VerificationRequirementController],
  providers: [VerificationRequirementService],
  exports: [VerificationRequirementService],
})
export class VerificationRequirementModule {}
