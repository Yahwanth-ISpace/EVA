import { Module } from '@nestjs/common';
import { VerificationRequirementService } from './verification-requirement.service';
import { VerificationRequirementController } from './verification-requirement.controller';
import { MongoModule } from '../mongo/mongo.module';

@Module({
  imports: [MongoModule],
  controllers: [VerificationRequirementController],
  providers: [VerificationRequirementService],
  exports: [VerificationRequirementService],
})
export class VerificationRequirementModule {}
