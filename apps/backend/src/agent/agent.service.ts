import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.agent.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      throw new NotFoundException(`Agent with id ${id} not found`);
    }
    return agent;
  }

  async create(dto: CreateAgentDto) {
    try {
      return await this.prisma.agent.create({
        data: {
          name: dto.name.trim(),
          twilioPhoneNumber: dto.twilioPhoneNumber.trim(),
          twilioPhoneNumberExt: dto.twilioPhoneNumberExt?.trim() || '+1',
          status: dto.status ?? AgentStatus.READY,
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `An agent named "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAgentDto) {
    await this.findOne(id);

    const data: Prisma.AgentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.twilioPhoneNumber !== undefined) {
      data.twilioPhoneNumber = dto.twilioPhoneNumber.trim();
    }
    if (dto.twilioPhoneNumberExt !== undefined) {
      data.twilioPhoneNumberExt = dto.twilioPhoneNumberExt.trim();
    }
    if (dto.status !== undefined) data.status = dto.status;

    try {
      return await this.prisma.agent.update({
        where: { id },
        data,
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `An agent named "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }
}
