import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';

@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentService.create(dto);
  }

  @Get()
  findAll(@Req() req) {
    const user = req.user;
    return this.appointmentService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.appointmentService.findOne(id, req.user);
  }
}
