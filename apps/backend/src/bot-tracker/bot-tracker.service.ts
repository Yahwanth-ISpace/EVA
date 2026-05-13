import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { BotTrackerDto } from './dto/bot-tracker.dto';
import { CreateBotTrackerDto } from './dto/create-bot-tracker.dto';

@Injectable()
export class BotTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  private mapTracker(tracker: {
    id: string;
    payeeId: string;
    callLog: Prisma.JsonValue | null;
    createdAt: Date;
  }): BotTrackerDto {
    return {
      id: tracker.id,
      PatientID: tracker.payeeId,
      callLog: tracker.callLog,
      createdAt: tracker.createdAt,
    };
  }

  /**
   * Create a new tracker record asynchronously
   * @param createBotTrackerDto - PatientID (external id) and callLog (stored as Prisma Json)
   */
  async create(createBotTrackerDto: CreateBotTrackerDto): Promise<BotTrackerDto> {
    const { PatientID, callLog } = createBotTrackerDto;

    const tracker = await this.prisma.botTracker.create({
      data: {
        payeeId: PatientID,
        callLog: callLog as Prisma.InputJsonValue,
      },
    });

    return this.mapTracker(tracker);
  }

  /**
   * Retrieve all tracker records for a specific patient / legacy payee key
   */
  async findByPatientID(PatientID: string): Promise<BotTrackerDto[]> {
    const trackers = await this.prisma.botTracker.findMany({
      where: { payeeId: PatientID },
      orderBy: { createdAt: 'desc' },
    });

    return trackers.map((t) => this.mapTracker(t));
  }

  /** @alias findByPatientID — path param is the same external id used as `payeeId` on the media stream. */
  async findByPayeeId(payeeId: string): Promise<BotTrackerDto[]> {
    return this.findByPatientID(payeeId);
  }

  /**
   * Retrieve a specific tracker record by ID
   */
  async findById(id: string): Promise<BotTrackerDto | null> {
    const tracker = await this.prisma.botTracker.findUnique({
      where: { id },
    });

    return tracker ? this.mapTracker(tracker) : null;
  }

  /**
   * Update a tracker record
   */
  async update(
    id: string,
    updateData: Partial<BotTrackerDto>,
  ): Promise<BotTrackerDto> {
    const data: Record<string, unknown> = { ...updateData };
    if (data.PatientID != null) {
      data.payeeId = data.PatientID;
      delete data.PatientID;
    }
    delete data.id;
    delete data.createdAt;

    const tracker = await this.prisma.botTracker.update({
      where: { id },
      data: data as Prisma.BotTrackerUpdateInput,
    });

    return this.mapTracker(tracker);
  }

  /**
   * Delete a tracker record
   */
  async delete(id: string): Promise<BotTrackerDto> {
    const tracker = await this.prisma.botTracker.delete({
      where: { id },
    });

    return this.mapTracker(tracker);
  }
}
