import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';

@ApiTags('appointments')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @ApiOperation({ summary: 'Book appointment', description: 'Creates an appointment linking payee, provider, and office.' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments for current user' })
  findAll(@Req() req) {
    const user = req.user;
    return this.appointmentService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiParam({ name: 'id', example: 'appointment-uuid-here' })
  findOne(@Param('id') id: string, @Req() req) {
    return this.appointmentService.findOne(id, req.user);
  }
}
