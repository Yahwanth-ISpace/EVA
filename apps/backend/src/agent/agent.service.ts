import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentStatus } from '../prisma/enums';
import { isDuplicateKey, PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const db = await this.prisma.client();
    const agents = await db.orm.Agent.orderBy({ name: 1 }).all();
    return this.prisma.withIds(agents);
  }

  async findOne(id: string) {
    const db = await this.prisma.client();
    const agent = await db.orm.Agent.where({ _id: id }).first();
    if (!agent) {
      throw new NotFoundException(`Agent with id ${id} not found`);
    }
    return this.prisma.withIds(agent);
  }

  async create(dto: CreateAgentDto) {
    const db = await this.prisma.client();
    try {
      const agent = await db.orm.Agent.create({
        name: dto.name.trim(),
        twilioPhoneNumber: dto.twilioPhoneNumber.trim(),
        twilioPhoneNumberExt: dto.twilioPhoneNumberExt?.trim() || '+1',
        status: dto.status ?? AgentStatus.READY,
        startTime: null,
        endTime: null,
      });
      return this.prisma.withIds(agent);
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
    const db = await this.prisma.client();

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
      const agent = await db.orm.Agent.where({ _id: id }).update(data);
      return this.prisma.withIds(agent);
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
    const db = await this.prisma.client();
    await db.orm.Agent.where({ _id: id }).delete();
  }
}
