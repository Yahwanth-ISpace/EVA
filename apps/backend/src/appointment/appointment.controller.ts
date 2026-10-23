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
import { SaveEligibilityDto } from './dto/save-eligibility.dto';
import { TwilioService } from 'src/twilio/twilio.service';
import { AgentStatus } from 'src/mongo/enums';
import { MongoService } from 'src/mongo/mongo.service';
import { AgentDto } from 'src/schedular/dto/agent.dto';
import { Public } from 'src/auth/decorators/public.decorator';

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
    private readonly mongoService: MongoService,
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

    const callStatus = String(body.CallStatus ?? '').toLowerCase();
    if (!TWILIO_TERMINAL_CALL_STATUSES.has(callStatus)) {
      this.logger.log(`Ignoring non-terminal status ${callStatus}`);
      return { success: true };
    }

    this.logger.log(`Call ended with status ${callStatus}`);

    const context = this.twilioService.getStreamContextForCall(body.CallSid);

    this.logger.log(`Context: ${JSON.stringify(context)}`);

    if (!context) {
      this.logger.warn(`No stream context found for ${body.CallSid}`);
      return { success: true };
    }

    this.logger.log(`Updating agent ${context.AgentId}`);

    try {
      const updated = await (
        await this.mongoService.collection('Agent')
      ).updateOne(this.mongoService.idFilter(context.AgentId), {
        $set: {
        status: AgentStatus.READY,
        endTime: new Date(),
        },
      });

      this.logger.log(
        `Updated Agent: ${JSON.stringify({ modifiedCount: updated.modifiedCount })}`,
      );
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
