import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserProfileDto } from './dto/user-admin.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwtAuthGuard';
import { AccountApprovalService, AccountStatus } from '../auth/account-approval.service';
import { AuditService } from '../audit/audit.service';

type AdminRequest = { user: { userId: string } };

@ApiTags('user')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly approvals: AccountApprovalService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: AdminRequest) {
    return this.userService.create(dto, req.user.userId);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'List accounts with their approval status' })
  @ApiQuery({ name: 'status', enum: AccountStatus, required: false })
  accounts(@Query('status') status?: AccountStatus) {
    if (status && !Object.values(AccountStatus).includes(status)) {
      throw new BadRequestException('Unknown status');
    }
    return this.approvals.list(status);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a pending account so it can sign in' })
  async approve(@Param('id') id: string, @Req() req: AdminRequest) {
    await this.approvals.decide(id, AccountStatus.APPROVED, req.user.userId);
    return { id, status: AccountStatus.APPROVED };
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject or deactivate an account and revoke its sessions' })
  async reject(@Param('id') id: string, @Req() req: AdminRequest) {
    if (id === req.user.userId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    await this.approvals.decide(id, AccountStatus.REJECTED, req.user.userId);
    return { id, status: AccountStatus.REJECTED };
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Most recent audit log entries' })
  @ApiQuery({ name: 'limit', required: false })
  auditLogs(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.audit.list(limit ?? 200);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserProfileDto, @Req() req: AdminRequest) {
    if (id === req.user.userId && dto.role !== undefined) {
      throw new BadRequestException('You cannot change your own role');
    }
    return this.userService.updateProfile(id, dto);
  }
}
