import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Public health check for AWS/load balancers and Postman. No auth required. */
  @Get('health')
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }
}
