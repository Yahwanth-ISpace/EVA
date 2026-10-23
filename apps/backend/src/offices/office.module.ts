import { Module } from '@nestjs/common';
import { MongoModule } from 'src/mongo/mongo.module';
import { OfficeController } from './office.controller';
import { OfficeService } from './office.service';

@Module({
  imports: [MongoModule],
  controllers: [OfficeController],
  providers: [OfficeService],
})
export class OfficeModule {}
