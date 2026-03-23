import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PayeeService } from './payee.service';
import { CreatePayeeDto } from './dto/create-payee.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';

@ApiTags('payees')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('payees')
export class PayeeController {
  constructor(private readonly payeeService: PayeeService) {}

  @Post()
  @ApiOperation({
    summary: 'Create payee',
    description:
      'Creates a patient payee (user + payee record). Same shape as register PAYEE; requires JWT (typically ADMIN).',
  })
  @ApiResponse({ status: 201, description: 'Payee created.' })
  create(@Body() dto: CreatePayeeDto) {
    return this.payeeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List payees', description: 'Returns payees visible to the current user.' })
  findAll() {
    return this.payeeService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payee by ID' })
  @ApiParam({ name: 'id', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  findOne(@Param('id') id: string) {
    return this.payeeService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update payee' })
  @ApiParam({ name: 'id', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  update(@Param('id') id: string, @Body() dto: CreatePayeeDto) {
    return this.payeeService.update(id, dto);
  }
}
