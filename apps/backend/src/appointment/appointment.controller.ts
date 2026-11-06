import {
  Controller,
  Delete,
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
import { SaveEligibilityDto } from './dto/save-eligibility.dto';
import { TwilioService } from 'src/twilio/twilio.service';
import { AgentStatus } from 'src/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';
import { AgentDto } from 'src/schedular/dto/agent.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { TwilioWebhook } from 'src/auth/decorators/twilio-webhook.decorator';

/** Twilio terminal CallStatus values (call leg ended — agent should be released). */
const TWILIO_TERMINAL_CALL_STATUSES = new Set([
  'completed',
  'no-answer',
  'busy',
  'failed',
  'canceled',
]);

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
  @Roles('ADMIN')
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
  @TwilioWebhook()
  @HttpCode(200)
  async statusCallback(@Body() body: any) {
    const callSid = String(body?.CallSid ?? '');
    const callStatus = String(body?.CallStatus ?? '').toLowerCase();
    this.logger.log(`Status callback sid=${callSid} status=${callStatus}`);
    if (!TWILIO_TERMINAL_CALL_STATUSES.has(callStatus)) {
      return { success: true };
    }

    const context = this.twilioService.getStreamContextForCall(body.CallSid);

    if (!context) {
      this.logger.warn(`No stream context found for ${body.CallSid}`);
      return { success: true };
    }

    try {
      const db = await this.prisma.client();
      const updated = await db.orm.Agent.where({
        _id: context.AgentId,
      }).update({
        status: AgentStatus.READY,
        endTime: new Date(),
      });

      this.logger.log(`Released agent ${context.AgentId}`);
    } catch (err) {
      this.logger.error('Failed to update agent', err);
    }

    this.twilioService.removeStreamContext(body.CallSid);

    return { success: true };
  }

  @Get()
  @ApiOperation({
    summary: 'List appointments',
    description: 'Administrators and operators both see every appointment. Access is not limited to the signed-in person.',
  })
  findAll() {
    return this.appointmentService.findAll();
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Delete an appointment',
    description: 'Administrators only.',
  })
  @ApiParam({ name: 'id', example: 'appointment-uuid-here' })
  remove(@Param('id') id: string) {
    return this.appointmentService.remove(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiParam({ name: 'id', example: 'appointment-uuid-here' })
  findOne(@Param('id') id: string) {
    return this.appointmentService.findOne(id);
  }

  @Post(':id/save-eligibility')
  @ApiOperation({
    summary: 'Save eligibility to Sabrina',
    description:
      'Updates local verification extraction and posts the eligibility payload to Sabrina SaveEligibility.',
  })
  @ApiParam({ name: 'id', example: 'appointment-uuid-or-mongo-id' })
  saveEligibility(
    @Param('id') id: string,
    @Body() body: SaveEligibilityDto,
    @Req() req,
  ) {
    return this.appointmentService.saveEligibilityToSabrina(
      id,
      req.user,
      body.extractedData ?? {},
    );
  }
}
