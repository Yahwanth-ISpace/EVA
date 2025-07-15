import { Module } from '@nestjs/common';
import { PayeeService } from './payee.service';
import { PayeeController } from './payee.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PayeeController],
  providers: [PayeeService],
})
export class PayeeModule {}
