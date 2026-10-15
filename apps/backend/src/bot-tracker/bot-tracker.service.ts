import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { BotTrackerDto } from './dto/bot-tracker.dto';
import { CreateBotTrackerDto } from './dto/create-bot-tracker.dto';

@Injectable()
export class BotTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  private mapTracker(tracker: {
    id: string;
    payeeId: string;
    callLog: unknown;
    createdAt: Date;
  }): BotTrackerDto {
    return {
      id: tracker.id,
      PatientID: tracker.payeeId,
      payeeId: tracker.payeeId,
      callLog: tracker.callLog,
      createdAt: tracker.createdAt,
    };
  }

  async create(createBotTrackerDto: CreateBotTrackerDto): Promise<BotTrackerDto> {
    const { PatientID, callLog } = createBotTrackerDto;
    const db = await this.prisma.client();
    const tracker = this.prisma.withIds(
      await db.orm.BotTracker.create({
        payeeId: PatientID,
        callLog: callLog ?? null,
      }),
    );

    return this.mapTracker(tracker);
  }

  async findByPatientID(PatientID: string): Promise<BotTrackerDto[]> {
    const db = await this.prisma.client();
    const trackers = this.prisma.withIds(
      await db.orm.BotTracker.where({ payeeId: PatientID })
        .orderBy({ createdAt: -1 })
        .all(),
    );

    return trackers.map((t) => this.mapTracker(t));
  }

  async findByPayeeId(payeeId: string): Promise<BotTrackerDto[]> {
    return this.findByPatientID(payeeId);
  }

  async findById(id: string): Promise<BotTrackerDto | null> {
    const db = await this.prisma.client();
    const tracker = await db.orm.BotTracker.where({ _id: id }).first();
    return tracker ? this.mapTracker(this.prisma.withIds(tracker)) : null;
  }

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

    const db = await this.prisma.client();
    const tracker = this.prisma.withIds(
      await db.orm.BotTracker.where({ _id: id }).update(data),
    );

    return this.mapTracker(tracker);
  }

  async delete(id: string): Promise<BotTrackerDto> {
    const db = await this.prisma.client();
    const tracker = this.prisma.withIds(
      await db.orm.BotTracker.where({ _id: id }).delete(),
    );

    return this.mapTracker(tracker);
  }
}
