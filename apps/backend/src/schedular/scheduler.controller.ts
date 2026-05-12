import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SchedulerService } from './scheduler.service';
import * as appointmentData from './sample.json';
import { AppointmentDetailsDto } from 'src/appointment/dto/appointment-details.dto';

@Controller('scheduler')
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  @Get('sample-data')
  @ApiOperation({ summary: 'Get sample JSON data' })
  @ApiResponse({
    status: 200,
    description: 'Returns the sample.json file content',
  })
  getSampleData(): Record<string, any> {
    return appointmentData;
  }

  @Get('appointment')
  @ApiOperation({
    summary: 'Get verification fields transformed from appointment data',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns the verification fields with questions, field names, and order',
  })
  getVerificationFields(): string {
    this.schedulerService.handleCron();
    return 'call got triggered, Check logs for details.';
  }
}
