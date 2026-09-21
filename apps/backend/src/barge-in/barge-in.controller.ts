import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { BargeInService } from './barge-in.service';
import { BargeInDto } from './dto/barge-in.dto';

@Controller('barge-in')
export class BargeInController {
  constructor(
    private readonly bargeInService: BargeInService,
  ) {}

  @Post()
  async triggerBargeIn(
    @Body() dto: BargeInDto,
  ) {
    return this.bargeInService.triggerBargeIn(dto);
  }
}