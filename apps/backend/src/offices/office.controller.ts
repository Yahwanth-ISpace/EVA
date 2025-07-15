import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { OfficeService } from './office.service';
import { CreateOfficeDto } from './dto/create-office.dto';

@Controller('offices')
export class OfficeController {
  constructor(private readonly officeService: OfficeService) {}

  @Post()
  create(@Body() dto: CreateOfficeDto) {
    return this.officeService.create(dto);
  }

  @Get()
  findAll() {
    return this.officeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.officeService.findOne(id);
  }
}
