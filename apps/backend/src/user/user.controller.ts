import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserProfileDto } from './dto/user-admin.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwtAuthGuard';

@ApiTags('user')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserProfileDto) {
    return this.userService.updateProfile(id, dto);
  }
}
