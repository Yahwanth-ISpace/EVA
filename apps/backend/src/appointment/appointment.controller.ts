import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
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
import { TwilioService } from 'src/twilio/twilio.service';
import { AgentStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AgentDto } from 'src/schedular/dto/agent.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('appointments')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentController {
  private readonly logger = new Logger(AppointmentController.name);
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly twilioService: TwilioService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Formated appointment',
    description:
      'Creates an appointment which is formated from RAW paylod sent from Sabrina.',
  })
  create(
    @Body() appointment: AppointmentDetailsDto,
    @Body('agentId') agentId: string,
  ) {
    return this.appointmentService.create(appointment, agentId);
  }

  @Post('status-callback')
  @Public()
  @HttpCode(200)
  async statusCallback(@Body() body: any) {
    this.logger.log('==============================');
    this.logger.log('STATUS CALLBACK RECEIVED');
    this.logger.log(JSON.stringify(body));

    if (body.CallStatus !== 'completed') {
      this.logger.log(`Ignoring status ${body.CallStatus}`);
      return { success: true };
    }

    this.logger.log('Call completed');

    const context = this.twilioService.getStreamContextForCall(body.CallSid);

    this.logger.log(`Context: ${JSON.stringify(context)}`);

    if (!context) {
      this.logger.warn(`No stream context found for ${body.CallSid}`);
      return { success: true };
    }

    this.logger.log(`Updating agent ${context.AgentId}`);

    try {
      const updated = await this.prisma.agent.update({
        where: {
          id: context.AgentId,
        },
        data: {
          status: AgentStatus.READY,
          endTime: new Date(),
        },
      });

      this.logger.log(`Updated Agent: ${JSON.stringify(updated)}`);
    } catch (err) {
      this.logger.error('Failed to update agent', err);
    }

    this.twilioService.removeStreamContext(body.CallSid);

    return { success: true };
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
