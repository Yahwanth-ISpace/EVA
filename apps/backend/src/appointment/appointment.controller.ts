import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';
import { AppointmentDetailsDto } from './dto/appointment-details.dto';

@ApiTags('appointments')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @ApiOperation({
    summary: 'Formated appointment',
    description:
      'Creates an appointment which is formated from RAW paylod sent from Sabrina.',
  })
  create(@Body() appointment: AppointmentDetailsDto) {
    return this.appointmentService.create(appointment);
  }

  // @Get()
  // @ApiOperation({ summary: 'List appointments for current user' })
  // findAll(@Req() req) {
  //   const user = req.user;
  //   return this.appointmentService.findAll(user);
  // }

  // @Get(':id')
  // @ApiOperation({ summary: 'Get appointment by ID' })
  // @ApiParam({ name: 'id', example: 'appointment-uuid-here' })
  // findOne(@Param('id') id: string, @Req() req) {
  //   return this.appointmentService.findOne(id, req.user);
  // }
}
