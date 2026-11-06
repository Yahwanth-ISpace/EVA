import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { BargeInService } from './barge-in.service';
import { BargeInDto } from './dto/barge-in.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('barge-in')
export class BargeInController {
  constructor(
    private readonly bargeInService: BargeInService,
  ) {}

  @Post()
  @Roles('ADMIN')
  async triggerBargeIn(
    @Body() dto: BargeInDto,
  ) {
    return this.bargeInService.triggerBargeIn(dto);
  }
}
