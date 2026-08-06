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
  @HttpCode(200)
  async statusCallback(@Body() body: any) {
    this.logger.log(
      `Call Status: ${body.CallStatus}, CallSid: ${body.CallSid}`,
    );

    // Only process completed calls
    if (body.CallStatus !== 'completed') {
      return { success: true };
    }

    // Retrieve the context you stored when the call was created
    const context = this.twilioService.getStreamContextForCall(body.CallSid);

    if (!context) {
      this.logger.warn(`No stream context found for CallSid ${body.CallSid}`);
      return { success: true };
    }

    await this.prisma.agent.update({
      where: {
        id: context ? context.AgentId : '', // or context.AgentId depending on your context type
      },
      data: {
        status: AgentStatus.READY,
        endTime: new Date(),
      },
    });

    this.logger.log(`Agent ${context.AgentId} marked READY`);

    return { success: true };
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
