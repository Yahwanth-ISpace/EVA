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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuthGuard';
import { FileInterceptor } from '@nestjs/platform-express';
import { TranscriptionService } from 'src/transcription/transcription.service';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { ApiTokenGuard } from 'src/auth/guards/apiTokenGuard';
import { VerifyPayeeTranscriptDto, PushExtractedDto } from './dto/verification-request.dto';

interface Request {
  user?: {
    userId: string;
    role: string;
  };
}

@ApiTags('verifications')
@Controller('verifications')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly transcriptionService: TranscriptionService,
  ) {}

  @UseGuards(ApiTokenGuard)
  @Post(':payeeId')
  @ApiBearerAuth('verifications-api-token')
  @ApiOperation({
    summary: 'Simulate verification from transcript',
    description:
      'Parses `transcript` with AI to extract benefit fields. Requires `Authorization: Bearer <VERIFICATIONS_API_TOKEN>`.',
  })
  @ApiParam({ name: 'payeeId', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, description: 'Verification result / extracted data.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API token.' })
  async verifyPayee(
    @Param('payeeId') id: string,
    @Body() dto: VerifyPayeeTranscriptDto,
  ) {
    return this.verificationService.simulateVerification(id, dto.transcript);
  }

  /** Push extracted benefit data from a call (e.g. media stream). Creates or updates verification for payeeId. */
  @UseGuards(ApiTokenGuard)
  @Post(':payeeId/push-extracted')
  @ApiBearerAuth('verifications-api-token')
  @ApiOperation({
    summary: 'Push extracted fields from call',
    description:
      'Upserts extracted coverage/deductible/copay/validity (optional transcript). Used by Twilio media stream or integrations.',
  })
  @ApiParam({ name: 'payeeId', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  async pushExtracted(
    @Param('payeeId') payeeId: string,
    @Body() body: PushExtractedDto,
  ) {
    const { transcript, ...extracted } = body;
    return this.verificationService.pushExtractedData(
      payeeId,
      extracted,
      transcript ?? undefined,
    );
  }

  /** Same as verifyFromAudio but accepts extracted call fields in the body (no audio file). */
  @UseGuards(ApiTokenGuard)
  @Post('from-extracted-call/:payeeId')
  @ApiBearerAuth('verifications-api-token')
  @ApiOperation({
    summary: 'Save verification from extracted JSON',
    description:
      'Persists extracted fields keyed by verification requirement field names. You may include extra keys beyond coverage/deductible/copay/validity if your requirement defines them. Optional `transcript` is appended.',
  })
  @ApiParam({ name: 'payeeId', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiBody({
    description:
      'Any keys matching your verification requirement field names; `transcript` is optional and stored separately.',
    schema: {
      example: {
        coverage: '80%',
        deductible: '500 dollars',
        copay: '20 dollars',
        validity: 'December 2025',
        transcript: 'EVA: ... User: ...',
      },
    },
  })
  async verifyFromExtractedCall(
    @Param('payeeId') payeeId: string,
    @Body() body: Record<string, string | null | undefined>,
  ) {
    const { transcript, ...extracted } = body;
    const verification = await this.verificationService.verifyFromExtractedCall(
      payeeId,
      extracted,
      transcript ?? undefined,
    );
    const extractedResponse = await this.verificationService.getExtractedForResponse(verification.id);
    return {
      saved: true,
      extracted: extractedResponse,
    };
  }

  @Post('from-audio/:payeeId')
  @UseGuards(ApiTokenGuard)
  @ApiBearerAuth('verifications-api-token')
  @ApiOperation({
    summary: 'Verify from audio file',
    description:
      'Uploads audio → transcribe → AI extract → save verification. `payeeId` in path or query param `payeeId`.',
  })
  @ApiParam({ name: 'payeeId', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiQuery({ name: 'payeeId', required: false, description: 'Alternative to path param.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Audio file (e.g. mp3, wav).',
        },
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
  async verifyFromAudio(
    @Param('payeeId') payeeId: string,
    @Query('payeeId') queryPayeeId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const finalPayeeId = payeeId || queryPayeeId;
    if (!finalPayeeId) throw new BadRequestException('payeeId is required');

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const verification = await this.verificationService.verifyFromAudio(
      file.path,
      finalPayeeId,
    );
    const extractedResponse = await this.verificationService.getExtractedForResponse(verification.id);
    return {
      saved: true,
      extracted: extractedResponse,
    };
  }

  // ✅ Only logged-in users can fetch verifications
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({
    summary: 'List verifications for current user',
    description: 'Returns verifications scoped to the logged-in user (JWT).',
  })
  async findAll(@Req() req: Request) {
    const user = req.user as { userId: string; role: string };
    return this.verificationService.findAll(user);
  }

  // ✅ Only logged-in users can see all their verifications
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Get verification by ID' })
  @ApiParam({ name: 'id', example: 'verification-uuid-here' })
  async findById(@Param('id') id: string, @Req() req: Request) {
    return this.verificationService.findById(id);
  }

  @UseGuards(ApiTokenGuard)
  @Post(':payeeId/parse-transcript')
  @ApiBearerAuth('verifications-api-token')
  @ApiOperation({
    summary: 'Parse transcript and extract verification fields using Gemini AI',
    description:
      'Analyzes a call transcript to extract verification fields by matching fields mentioned in EVA questions to user responses. Uses Gemini AI for intelligent extraction.',
  })
  @ApiParam({
    name: 'payeeId',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({
    schema: {
      example: {
        transcriptToAppend: 'EVA: What is the coverage?\nUser: 50%',
        verificationRequirementId: 'optional-id',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully extracted verification fields',
    schema: {
      example: {
        payeeId: 'payee-123',
        verificationFields: [
          {
            question: 'What is the basic coverage?',
            field: 'coverage.basic',
            required: true,
            order: 1,
            value: '50%',
          },
        ],
      },
    },
  })
  async parseTranscriptForVerification(
    @Param('payeeId') payeeId: string,
    @Body('transcriptToAppend') transcriptToAppend: string,
    @Body('verificationRequirementId') verificationRequirementId?: string,
  ) {
    return this.verificationService.parseTranscriptForVerification(
      payeeId,
      transcriptToAppend,
      verificationRequirementId,
    );
  }
}
