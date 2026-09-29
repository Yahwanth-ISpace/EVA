import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwtAuthGuard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AgentService } from './agent.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

@ApiTags('agents')
@ApiBearerAuth('jwt-auth')
@Controller('agents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all agents (ADMIN only)' })
  findAll() {
    return this.agentService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get agent by ID (ADMIN only)' })
  @ApiParam({ name: 'id', example: 'agent-uuid-here' })
  findOne(@Param('id') id: string) {
    return this.agentService.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create agent (ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Agent created.' })
  create(@Body() dto: CreateAgentDto) {
    return this.agentService.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update agent (ADMIN only)' })
  @ApiParam({ name: 'id', example: 'agent-uuid-here' })
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agentService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete agent (ADMIN only)' })
  @ApiParam({ name: 'id', example: 'agent-uuid-here' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.agentService.remove(id);
  }
}
