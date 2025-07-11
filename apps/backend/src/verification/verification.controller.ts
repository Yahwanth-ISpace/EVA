import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from 'src/auth/jwtAuthGuard';
import { FileInterceptor } from '@nestjs/platform-express';
import { TranscriptionService } from 'src/transcription/transcription.service';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@UseGuards(JwtAuthGuard)
@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly transcriptionService: TranscriptionService,
  ) {}

  @Post(':patientId')
  async verifyPatient(
    @Param('patientId') id: string,
    @Body('transcript') transcript: string,
  ) {
    return this.verificationService.simulateVerification(id, transcript);
  }

  @Post('from-audio/:patientId')
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
  async verifyFromAudio(
    @Param('patientId') patientId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const verification = await this.verificationService.verifyFromAudio(
      patientId,
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

  @Get()
  async findAll() {
    return this.verificationService.findAll();
  }
}
