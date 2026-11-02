import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SchedulerService } from './scheduler.service';
import * as appointmentData from './sample.json';
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiBearerAuth('jwt-auth')
@Roles('ADMIN')
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
    this.assertHttpTriggerEnabled();
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
    this.assertHttpTriggerEnabled();
    this.schedulerService.handleCron();
    return 'call got triggered, Check logs for details.';
  }

  private assertHttpTriggerEnabled(): void {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ENABLE_SCHEDULER_HTTP !== 'true'
    ) {
      throw new NotFoundException();
    }
  }
}
