import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OfficeController } from './office.controller';
import { OfficeService } from './office.service';

@Module({
  imports: [PrismaModule],
  controllers: [OfficeController],
  providers: [OfficeService],
})
export class OfficeModule {}
