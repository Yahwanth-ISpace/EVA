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
          try {
            const ext = path.extname(file?.originalname || 'default.mp3');
            cb(null, `${uuidv4()}${ext}`);
          } catch (error) {
            console.error('❌ Multer filename error:', error);
            cb(error, 'fallback.mp3');
          }
        },
      }),
    }),
  )
  async verifyFromAudio(
    @Param('patientId') patientId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const transcriptResult = await this.transcriptionService.transcribeAudio(
      file.path,
    );

    if (transcriptResult.error) {
      return { error: transcriptResult.error };
    }

    const verification = await this.verificationService.simulateVerification(
      patientId,
      transcriptResult.transcript,
    );

    return {
      transcript: transcriptResult.transcript,
      extracted: {
        coverage: verification.coverage,
        deductible: verification.deductible,
        copay: verification.copay,
        validity: verification.validity,
      },
      saved: true,
    };
  }

  @Get()
  async findAll() {
    return this.verificationService.findAll();
  }
}
