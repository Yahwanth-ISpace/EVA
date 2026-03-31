import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { BotTrackerService } from './bot-tracker.service';
import { BotTrackerDto } from './dto/bot-tracker.dto';
import { CreateBotTrackerDto } from './dto/create-bot-tracker.dto';
// import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';

@ApiTags('bot-trackers')
@ApiBearerAuth('jwt-auth')
// @UseGuards(JwtAuthGuard)
@Controller('bot-trackers')
export class BotTrackerController {
  constructor(private readonly botTrackerService: BotTrackerService) {}

  /**
   * Create a new tracker record asynchronously
   * Accepts payeeId and callLog in the request body
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create bot tracker record asynchronously',
    description:
      'Creates a new bot tracker record with payeeId and callLog. The operation is asynchronous and returns immediately.',
  })
  @ApiResponse({
    status: 201,
    description: 'Bot tracker record created successfully',
    schema: {
      example: {
        id: 'tracker-uuid',
        payeeId: 'payee-uuid',
        callLog: 'EVA: Sample line from the call',
        createdAt: '2026-03-25T10:00:00Z',
      },
    },
  })
  async create(@Body() createBotTrackerDto: CreateBotTrackerDto) {
    return this.botTrackerService.create(createBotTrackerDto);
  }

  /**
   * List trackers by query (preferred for dashboards): avoids multi-segment paths that some proxies mishandle.
   * `GET /bot-trackers?appointmentId=...` or `?payeeId=...` (exactly one required).
   */
  @Get()
  @ApiOperation({
    summary: 'List bot trackers by query',
    description:
      'Pass `appointmentId` for lines scoped to one visit, or `payeeId` for all lines for that patient.',
  })
  @ApiQuery({ name: 'appointmentId', required: false })
  @ApiQuery({ name: 'payeeId', required: false })
  async findByQuery(
    @Query('appointmentId') appointmentId?: string,
    @Query('payeeId') payeeId?: string,
  ) {
    const appt = appointmentId?.trim();
    const payee = payeeId?.trim();
    if (appt) {
      return this.botTrackerService.findByAppointmentId(appt);
    }
    if (payee) {
      return this.botTrackerService.findByPayeeId(payee);
    }
    throw new BadRequestException(
      'Provide query parameter appointmentId or payeeId',
    );
  }

  /**
   * Get all tracker records for a specific payee
   */
  @Get('payee/:payeeId')
  @ApiOperation({
    summary: 'Get bot tracker records by payee ID',
    description:
      'Retrieves all bot tracker records associated with a specific payee, ordered by most recent first.',
  })
  @ApiParam({
    name: 'payeeId',
    description: 'UUID of the payee',
    example: 'payee-uuid-here',
  })
  async findByPayeeId(@Param('payeeId') payeeId: string) {
    return this.botTrackerService.findByPayeeId(payeeId);
  }

  /**
   * Get tracker records for a single appointment (call activity is not mixed with other appointments).
   */
  @Get('appointment/:appointmentId')
  @ApiOperation({
    summary: 'Get bot tracker records by appointment ID',
    description:
      'Returns call log lines scoped to this appointment only; same payee’s other visits are excluded.',
  })
  @ApiParam({
    name: 'appointmentId',
    description: 'UUID of the appointment',
    example: 'appointment-uuid-here',
  })
  async findByAppointmentId(@Param('appointmentId') appointmentId: string) {
    return this.botTrackerService.findByAppointmentId(appointmentId);
  }

  /**
   * Get a specific tracker record by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get bot tracker record by ID',
    description:
      'Retrieves a specific bot tracker record by its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the tracker record',
    example: 'tracker-uuid-here',
  })
  async findById(@Param('id') id: string) {
    return this.botTrackerService.findById(id);
  }

  /**
   * Update a tracker record
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update bot tracker record',
    description: 'Updates an existing bot tracker record with new data.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the tracker record',
    example: 'tracker-uuid-here',
  })
  async update(
    @Param('id') id: string,
    @Body() updateBotTrackerDto: Partial<BotTrackerDto>,
  ) {
    return this.botTrackerService.update(id, updateBotTrackerDto);
  }

  /**
   * Delete a tracker record
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete bot tracker record',
    description: 'Deletes a specific bot tracker record by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the tracker record',
    example: 'tracker-uuid-here',
  })
  async delete(@Param('id') id: string) {
    return this.botTrackerService.delete(id);
  }
}
