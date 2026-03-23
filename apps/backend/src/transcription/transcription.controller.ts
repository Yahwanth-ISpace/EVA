import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Get,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptionService } from './transcription.service';
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
  };

  @Get('transcribe-test')
  @ApiOperation({
    summary: 'Dev: run transcription on bundled test audio',
    description: 'Looks for `src/assets/audio/audioTest.mp3` (or dist path). Returns transcript or error if file missing.',
  })
  async test() {
    // Try to find the test audio file in different possible locations
    const possiblePaths = [
      path.join(process.cwd(), 'src', 'assets', 'audio', 'audioTest.mp3'),
      path.join(process.cwd(), 'dist', 'assets', 'audio', 'audioTest.mp3'),
      path.join(__dirname, '..', 'assets', 'audio', 'audioTest.mp3'),
    ];

    let audioFilePath: string | null = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        audioFilePath = testPath;
        break;
      }
    }

    if (!audioFilePath) {
      return {
        error: 'Test audio file not found. Tried paths:',
        paths: possiblePaths,
      };
    }

    try {
      const result = await this.transcriptionService.transcribeAudio(
        audioFilePath,
      );
      return {
        success: true,
        filePath: audioFilePath,
        transcript: result.transcript,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        filePath: audioFilePath,
      };
    }
  }
}
