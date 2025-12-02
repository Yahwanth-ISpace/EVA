import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptionService } from './transcription.service';
import { JwtAuthGuard } from '../auth/guards/jwtAuthGuard';
import { AiService } from '../ai/ai.service';
import { Express } from 'express';

@Controller('transcription')
@UseGuards(JwtAuthGuard)
export class TranscriptionController {
  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly aiService: AiService,
  ) {}

  @Post()
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
  async transcribe(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return {
        error:
          'No file received. Ensure the field name is "file" and content type is multipart/form-data.',
      };
    }

    const transcriptResult = await this.transcriptionService.transcribeAudio(
      file.path,
    );

    if (!transcriptResult.transcript) {
      return { error: 'Transcription failed' };
    }

    const extracted = await this.aiService.extractInsuranceDetails(
      transcriptResult.transcript,
    );

    return {
      transcript: transcriptResult,
      extracted,
    };
  }
}
