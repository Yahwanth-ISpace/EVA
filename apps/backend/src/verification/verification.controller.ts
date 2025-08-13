import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';
import { FileInterceptor } from '@nestjs/platform-express';
import { TranscriptionService } from 'src/transcription/transcription.service';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { ApiTokenGuard } from 'src/auth/guards/apiTokenGuard';

interface Request {
  user?: {
    userId: string;
    role: string;
  };
}

@Controller('verifications')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly transcriptionService: TranscriptionService,
  ) {}

  @UseGuards(ApiTokenGuard)
  @Post(':payeeId')
  async verifyPayee(
    @Param('payeeId') id: string,
    @Body('transcript') transcript: string,
  ) {
    return this.verificationService.simulateVerification(id, transcript);
  }

  @UseGuards(ApiTokenGuard)
  @Post('from-audio/:payeeId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
    }),
  )
  @UseGuards(ApiTokenGuard)
  async verifyFromAudio(
    @Param('payeeId') payeeId: string,
    @Query('payeeId') queryPayeeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('Received payeeId in route:', payeeId); // ✅ log
    const finalPayeeId = payeeId || queryPayeeId;
    if (!finalPayeeId) throw new BadRequestException('payeeId is required');

    const verification = await this.verificationService.verifyFromAudio(
      finalPayeeId,
      file.path,
    );
    return {
      saved: true,
      extracted: {
        coverage: verification.coverage,
        deductible: verification.deductible,
        copay: verification.copay,
        validity: verification.validity,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as { userId: string; role: string };
    return this.verificationService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Req() req: Request) {
    const user = req.user as { userId: string; role: string };
    return this.verificationService.findAll(user);
  }
}
