import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { VerificationRequirementService } from './verification-requirement.service';
import { CreateVerificationRequirementDto } from './dto/create-verification-requirement.dto';
import { UpdateVerificationRequirementDto } from './dto/update-verification-requirement.dto';

@Controller('verification-requirements')
export class VerificationRequirementController {
  constructor(
    private readonly verificationRequirementService: VerificationRequirementService,
  ) {}

  @Post()
  create(@Body() createDto: CreateVerificationRequirementDto) {
    return this.verificationRequirementService.create(createDto);
  }

  @Get('payee/:payeeId')
  findByPayeeId(@Param('payeeId') payeeId: string) {
    return this.verificationRequirementService.findByPayeeId(payeeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.verificationRequirementService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateVerificationRequirementDto,
  ) {
    return this.verificationRequirementService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.verificationRequirementService.remove(id);
  }
}
