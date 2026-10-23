import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentStatus } from '../mongo/enums';
import { isDuplicateKey, MongoService } from '../mongo/mongo.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentService {
  constructor(private readonly mongoService: MongoService) {}

  async findAll() {
    const agents = await (await this.mongoService.collection('Agent'))
      .find({})
      .sort({ name: 1 })
      .toArray();
    return this.mongoService.withIds(agents);
  }

  async findOne(id: string) {
    const agent = await (await this.mongoService.collection('Agent')).findOne(
      this.mongoService.idFilter(id),
    );
    if (!agent) {
      throw new NotFoundException(`Agent with id ${id} not found`);
    }
    return this.mongoService.withIds(agent);
  }

  async create(dto: CreateAgentDto) {
    const collection = await this.mongoService.collection('Agent');
    try {
      const agent = {
        name: dto.name.trim(),
        twilioPhoneNumber: dto.twilioPhoneNumber.trim(),
        twilioPhoneNumberExt: dto.twilioPhoneNumberExt?.trim() || '+1',
        status: dto.status ?? AgentStatus.READY,
        startTime: null,
        endTime: null,
      };
      const result = await collection.insertOne(agent);
      return this.mongoService.withIds({
        ...agent,
        _id: result.insertedId,
      });
    } catch (err: unknown) {
      if (isDuplicateKey(err)) {
        throw new ConflictException(
          `An agent named "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAgentDto) {
    await this.findOne(id);
    const collection = await this.mongoService.collection('Agent');

    const data: Record<string, string> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.twilioPhoneNumber !== undefined) {
      data.twilioPhoneNumber = dto.twilioPhoneNumber.trim();
    }
    if (dto.twilioPhoneNumberExt !== undefined) {
      data.twilioPhoneNumberExt = dto.twilioPhoneNumberExt.trim();
    }
    if (dto.status !== undefined) data.status = dto.status;

    try {
      await collection.updateOne(this.mongoService.idFilter(id), {
        $set: data,
      });
      return this.findOne(id);
    } catch (err: unknown) {
      if (isDuplicateKey(err)) {
        throw new ConflictException(
          `An agent named "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    const collection = await this.mongoService.collection('Agent');
    await collection.deleteOne(this.mongoService.idFilter(id));
  }
}
