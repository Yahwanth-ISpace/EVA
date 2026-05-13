import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { BotTrackerDto } from './dto/bot-tracker.dto';
import { CreateBotTrackerDto } from './dto/create-bot-tracker.dto';

@Injectable()
export class BotTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new tracker record asynchronously
   * @param createBotTrackerDto - PatientID and callLog (stored as Prisma Json)
   */
  async create(createBotTrackerDto: CreateBotTrackerDto): Promise<BotTrackerDto> {
    const { PatientID, callLog } = createBotTrackerDto;

    // // Validate that the payee exists
    // const payeeExists = await this.prisma.payee.findUnique({
    //   where: { id: PatientID },
    // });

    // if (!payeeExists) {
    //   throw new BadRequestException(`Payee with ID ${PatientID} does not exist`);
    // }

    // Create tracker record in MongoDB
    const tracker = await this.prisma.botTracker.create({
      data: {
        PatientID,
        callLog: callLog as Prisma.InputJsonValue,
      },
    });

    return tracker;
  }

  /**
   * Retrieve all tracker records for a specific payee
   * @param PatientID - ID of the payee
   * @returns - Array of tracker records
   */
  async findByPatientID(PatientID: string): Promise<BotTrackerDto[]> {
    const trackers = await this.prisma.botTracker.findMany({
      where: { PatientID },
      orderBy: { createdAt: 'desc' },
    });

    return trackers;
  }

  /**
   * Retrieve a specific tracker record by ID
   * @param id - ID of the tracker record
   * @returns - Tracker record or null if not found
   */
  async findById(id: string): Promise<BotTrackerDto | null> {
    const tracker = await this.prisma.botTracker.findUnique({
      where: { id },
    });

    return tracker;
  }

  /**
   * Update a tracker record
   * @param id - ID of the tracker record
   * @param updateData - Data to update
   * @returns - Updated tracker record
   */
  async update(
    id: string,
    updateData: Partial<BotTrackerDto>,
  ): Promise<BotTrackerDto> {
    const tracker = await this.prisma.botTracker.update({
      where: { id },
      data: updateData,
    });

    return tracker;
  }

  /**
   * Delete a tracker record
   * @param id - ID of the tracker record
   * @returns - Deleted tracker record
   */
  async delete(id: string): Promise<BotTrackerDto> {
    const tracker = await this.prisma.botTracker.delete({
      where: { id },
    });

    return tracker;
  }
}
