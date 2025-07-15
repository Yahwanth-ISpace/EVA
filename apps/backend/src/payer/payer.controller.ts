import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PayerService } from './payer.service';
import { CreatePayerDto } from './dto/create-payer.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwtAuthGuard';

@Controller('payers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayerController {
  constructor(private readonly payerService: PayerService) {}

  // ✅ Only ADMIN can create
  @Post()
  @Roles('ADMIN')
  create(@Body() createPayerDto: CreatePayerDto) {
    return this.payerService.create(createPayerDto);
  }

  @Get()
  findAll() {
    return this.payerService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.payerService.findOne(id);
  }
}
