import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PayeeService } from './payee.service';
import { CreatePayeeDto } from './dto/create-payee.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';

@UseGuards(JwtAuthGuard)
@Controller('payees')
export class PayeeController {
  constructor(private readonly payeeService: PayeeService) {}

  @Post()
  create(@Body() dto: CreatePayeeDto) {
    return this.payeeService.create(dto);
  }

  @Get()
  findAll() {
    return this.payeeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.payeeService.findOne(id);
  }
}
