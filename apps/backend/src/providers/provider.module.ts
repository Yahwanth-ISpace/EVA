import { Module } from '@nestjs/common';
import { MongoModule } from 'src/mongo/mongo.module';
import { ProviderController } from './provider.controller';
import { ProviderService } from './provider.service';

@Module({
  imports: [MongoModule],
  controllers: [ProviderController],
  providers: [ProviderService],
})
export class ProviderModule {}
