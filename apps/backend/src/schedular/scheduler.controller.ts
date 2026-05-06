import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as sampleData from './sample.json';

@Controller('scheduler')
export class SchedulerController {
  @Get('sample-data')
  @ApiOperation({ summary: 'Get sample JSON data' })
  @ApiResponse({
    status: 200,
    description: 'Returns the sample.json file content',
  })
  getSampleData(): Record<string, any> {
    return sampleData;
  }
}
