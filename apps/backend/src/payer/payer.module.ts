import { Module } from '@nestjs/common';
import { PayerService } from './payer.service';
import { PayerController } from './payer.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PayerController],
  providers: [PayerService],
})
export class PayerModule {}
