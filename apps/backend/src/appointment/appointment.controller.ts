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
import { BotTrackerService } from 'src/bot-tracker/bot-tracker.service';

@ApiTags('appointments')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly botTrackerService: BotTrackerService,
  ) {}

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

  /** Declared before @Get(':id') so "bot-trackers" is not captured as an appointment id. */
  @Get(':id/bot-trackers')
  @ApiOperation({
    summary: 'Bot / call activity lines for this appointment',
    description:
      'Live and historical call log rows scoped to this visit (same JWT as other appointment routes).',
  })
  @ApiParam({ name: 'id', example: 'appointment-uuid-here' })
  async getBotTrackersForAppointment(@Param('id') id: string, @Req() req) {
    await this.appointmentService.findOne(id, req.user);
    return this.botTrackerService.findByAppointmentId(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiParam({ name: 'id', example: 'appointment-uuid-here' })
  findOne(@Param('id') id: string, @Req() req) {
    return this.appointmentService.findOne(id, req.user);
  }
}
