import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { VerificationRequirementService } from './verification-requirement.service';
import { CreateVerificationRequirementDto } from './dto/create-verification-requirement.dto';
import { UpdateVerificationRequirementDto } from './dto/update-verification-requirement.dto';

@ApiTags('verification-requirements')
@Controller('verification-requirements')
export class VerificationRequirementController {
  constructor(
    private readonly verificationRequirementService: VerificationRequirementService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create verification requirement',
    description:
      'Defines which benefit fields to collect for a payee, in order. Optional `question` on each field sets the exact phrase EVA uses when asking.',
  })
  create(@Body() createDto: CreateVerificationRequirementDto) {
    return this.verificationRequirementService.create(createDto);
  }

  @Get('payee/:payeeId')
  @ApiOperation({
    summary: 'List requirements for a payee',
    description: 'Returns all verification requirements for the given payee (oldest first).',
  })
  @ApiParam({ name: 'payeeId', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  findByPayeeId(@Param('payeeId') payeeId: string) {
    return this.verificationRequirementService.findByPayeeId(payeeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one requirement by ID' })
  @ApiParam({ name: 'id', example: 'requirement-uuid-here' })
  findOne(@Param('id') id: string) {
    return this.verificationRequirementService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update requirement', description: 'Partial update of payeeId and/or verificationFields.' })
  @ApiParam({ name: 'id', example: 'requirement-uuid-here' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateVerificationRequirementDto,
  ) {
    return this.verificationRequirementService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete requirement' })
  @ApiParam({ name: 'id', example: 'requirement-uuid-here' })
  remove(@Param('id') id: string) {
    return this.verificationRequirementService.remove(id);
  }
}
