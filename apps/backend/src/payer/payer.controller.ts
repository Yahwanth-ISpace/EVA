import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PayerService } from './payer.service';
import { CreatePayerDto } from './dto/create-payer.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwtAuthGuard';

@ApiTags('payers')
@ApiBearerAuth('jwt-auth')
@Controller('payers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayerController {
  constructor(private readonly payerService: PayerService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create payer (ADMIN only)',
    description: 'Insurance company / plan record. Requires JWT with role ADMIN.',
  })
  create(@Body() createPayerDto: CreatePayerDto) {
    return this.payerService.create(createPayerDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all payers' })
  findAll() {
    return this.payerService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payer by ID' })
  @ApiParam({ name: 'id', example: 'payer-uuid-here' })
  findOne(@Param('id') id: string) {
    return this.payerService.findOne(id);
  }
}
