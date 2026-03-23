import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { OfficeService } from './office.service';
import { CreateOfficeDto } from './dto/create-office.dto';

@ApiTags('offices')
@Controller('offices')
export class OfficeController {
  constructor(private readonly officeService: OfficeService) {}

  @Post()
  @ApiOperation({ summary: 'Create office', description: 'Office location linked to a provider.' })
  create(@Body() dto: CreateOfficeDto) {
    return this.officeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all offices' })
  findAll() {
    return this.officeService.findAll();
  }

  @Get('provider/:providerId')
  @ApiOperation({ summary: 'Offices for a provider' })
  @ApiParam({ name: 'providerId', example: 'provider-uuid-here' })
  findByProvider(@Param('providerId') providerId: string) {
    return this.officeService.findByProviderId(providerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get office by ID' })
  @ApiParam({ name: 'id', example: 'office-uuid-here' })
  findOne(@Param('id') id: string) {
    return this.officeService.findOne(id);
  }
}
