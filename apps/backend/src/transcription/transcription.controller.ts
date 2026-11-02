import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { TranscriptionService } from './transcription.service';
import { audioUploadOptions } from '../common/upload/audio-upload';
import { JwtAuthGuard } from '../auth/guards/jwtAuthGuard';
import { AiService } from '../ai/ai.service';
import { Express } from 'express';

@ApiTags('transcription')
@ApiBearerAuth('jwt-auth')
@Controller('transcription')
@UseGuards(JwtAuthGuard)
export class TranscriptionController {
  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly aiService: AiService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Transcribe audio + extract insurance fields',
    description:
      'Multipart upload `file` → Whisper (or configured STT) → transcript. Then AI extracts coverage/deductible/copay/validity.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio file (mp3, wav, etc.)' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', audioUploadOptions()))
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
