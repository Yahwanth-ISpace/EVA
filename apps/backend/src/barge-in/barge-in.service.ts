import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { BargeInDto } from './dto/barge-in.dto';
import { MediaStreamHandlerService } from 'src/twilio/media-stream.handler';

@Injectable()
export class BargeInService {
  private readonly logger = new Logger(BargeInService.name);

  constructor(
    private readonly mediaStreamHandlerService: MediaStreamHandlerService,
  ) {}

  async triggerBargeIn(dto: BargeInDto) {
    const { appointmentId, reason } = dto;

    this.logger.log(
      `[BARGE-IN] Request received for appointment=${appointmentId}` +
        `${reason ? ` reason=${reason}` : ''}`,
    );

    const result =
      await this.mediaStreamHandlerService.bargeInForAppointment(
        appointmentId,
        reason,
      );

    if (!result) {
      throw new NotFoundException(
        `No active EVA call found for appointment ${appointmentId}`,
      );
    }

    return {
      success: true,
      message: 'Barge-in triggered successfully',
      appointmentId,
      callSid: result.callSid,
    };
  }
}