import { Injectable, NotFoundException } from '@nestjs/common';
import { Document } from 'mongodb';
import { MongoService } from 'src/mongo/mongo.service';
import { BotTrackerDto } from './dto/bot-tracker.dto';
import { CreateBotTrackerDto } from './dto/create-bot-tracker.dto';

@Injectable()
export class BotTrackerService {
  constructor(private readonly mongoService: MongoService) {}

  private mapTracker(tracker: Document & {
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

  private normalizeTracker(tracker: Document) {
    return {
      id: String(tracker._id),
      payeeId: String(tracker.payeeId),
      callLog: tracker.callLog,
      createdAt: tracker.createdAt as Date,
    };
  }

  async create(createBotTrackerDto: CreateBotTrackerDto): Promise<BotTrackerDto> {
    const { PatientID, callLog } = createBotTrackerDto;
    const document = {
      payeeId: PatientID,
      callLog: callLog ?? null,
      createdAt: new Date(),
    };
    const result = await (
      await this.mongoService.collection('BotTracker')
    ).insertOne(document);
    const tracker = {
      ...document,
      _id: result.insertedId,
      id: String(result.insertedId),
    };

    return this.mapTracker(this.normalizeTracker(tracker));
  }

  async findByPatientID(PatientID: string): Promise<BotTrackerDto[]> {
    const trackers = await (
      await this.mongoService.collection('BotTracker')
    )
      .find({ payeeId: PatientID })
      .sort({ createdAt: -1 })
      .toArray();

    return trackers.map((tracker) =>
      this.mapTracker(this.normalizeTracker(tracker)),
    );
  }

  async findByPayeeId(payeeId: string): Promise<BotTrackerDto[]> {
    return this.findByPatientID(payeeId);
  }

  async findById(id: string): Promise<BotTrackerDto | null> {
    const tracker = await (
      await this.mongoService.collection('BotTracker')
    ).findOne(this.mongoService.idFilter(id));
    return tracker
      ? this.mapTracker(this.normalizeTracker(tracker))
      : null;
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

    const collection = await this.mongoService.collection('BotTracker');
    await collection.updateOne(this.mongoService.idFilter(id), {
      $set: data,
    });
    const tracker = await collection.findOne(this.mongoService.idFilter(id));
    if (!tracker) throw new NotFoundException('Bot tracker not found');

    return this.mapTracker(this.normalizeTracker(tracker));
  }

  async delete(id: string): Promise<BotTrackerDto> {
    const collection = await this.mongoService.collection('BotTracker');
    const tracker = await collection.findOneAndDelete(
      this.mongoService.idFilter(id),
    );
    if (!tracker) throw new NotFoundException('Bot tracker not found');

    return this.mapTracker(this.normalizeTracker(tracker));
  }
}
