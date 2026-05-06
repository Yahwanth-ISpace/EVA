import { Controller, Get } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('scheduler')
export class SchedulerController {
  @Get('sample-data')
  @ApiOperation({ summary: 'Get sample JSON data' })
  @ApiResponse({
    status: 200,
    description: 'Returns the sample.json file content',
  })
  getSampleData(): Record<string, any> {
    const filePath = path.join(__dirname, 'sample.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }
}
