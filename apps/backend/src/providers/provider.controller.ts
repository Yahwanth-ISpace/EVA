import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('providers')
@ApiBearerAuth('jwt-auth')
@Controller('providers')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create provider', description: 'Healthcare provider (NPI, specialty, network).' })
  create(@Body() dto: CreateProviderDto) {
    return this.providerService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all providers' })
  findAll() {
    return this.providerService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get provider by ID' })
  @ApiParam({ name: 'id', example: 'provider-uuid-here' })
  findOne(@Param('id') id: string) {
    return this.providerService.findOne(id);
  }
}
