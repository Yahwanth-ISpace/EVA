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

  /** Push extracted benefit data from a call (e.g. media stream). Creates or updates verification for payeeId. */
  @UseGuards(ApiTokenGuard)
  @Post(':payeeId/push-extracted')
  async pushExtracted(
    @Param('payeeId') payeeId: string,
    @Body()
    body: {
      coverage?: string | null;
      deductible?: string | null;
      copay?: string | null;
      validity?: string | null;
      transcript?: string;
    },
  ) {
    const { transcript, ...extracted } = body;
    return this.verificationService.pushExtractedData(payeeId, extracted, transcript);
  }

  @Post('from-audio/:payeeId')
  @UseGuards(ApiTokenGuard)
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
    @Param('payeeId') payeeId: string,
    @Query('payeeId') queryPayeeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('Received payeeId in route:', payeeId);
    const finalPayeeId = payeeId || queryPayeeId;
    if (!finalPayeeId) throw new BadRequestException('payeeId is required');

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const verification = await this.verificationService.verifyFromAudio(
      file.path,
      finalPayeeId,
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

  // ✅ Only logged-in users can fetch verifications
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: Request) {
    return this.verificationService.findById(id);
  }

  // ✅ Only logged-in users can see all their verifications
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Req() req: Request) {
    const user = req.user as { userId: string; role: string };
    return this.verificationService.findAll(user);
  }
}
