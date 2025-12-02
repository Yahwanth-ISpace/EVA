import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TranscriptionService } from 'src/transcription/transcription.service';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly transcriptionService: TranscriptionService,
  ) {}

  async simulateVerification(payeeId: string, transcript: string) {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
    });
    if (!payee) throw new NotFoundException('Payee not found');

    const extracted = await this.aiService.extractInsuranceDetails(transcript);

    return this.prisma.verification.create({
      data: {
        payeeId,
        coverage: extracted.coverage || null,
        deductible: extracted.deductible,
        copay: extracted.copay,
        validity: extracted.validity,
        transcript,
      },
      include: { payee: true },
    });
  }

  async verifyFromAudio(payeeId: string, filePath: string) {
    if (!payeeId) {
      throw new BadRequestException('payeeId is required');
    }

    try {
      // 1. Transcription
      const transcriptResult =
        await this.transcriptionService.transcribeAudio(filePath);

      console.log('this is transcript', transcriptResult);
      if (!transcriptResult || !transcriptResult.transcript) {
        throw new BadRequestException('Transcription failed: empty transcript');
      }

      // 2. Extract insurance details using AI
      const extracted = await this.aiService.extractInsuranceDetails(
        transcriptResult.transcript,
      );
      if (!extracted) {
        throw new BadRequestException('AI failed to extract insurance details');
      }

      // 3. Save to database
      const record = await this.prisma.verification.create({
        data: {
          payeeId,
          coverage: extracted.coverage ?? null,
          deductible: extracted.deductible ?? null,
          copay: extracted.copay ?? null,
          validity: extracted.validity ?? null,
          transcript: transcriptResult.transcript,
        },
        include: { payee: true },
      });

      return record;
    } catch (err) {
      console.error('verifyFromAudio error:', err);
      throw err;
    } finally {
      // 4. Cleanup audio file
      try {
        await fs.promises.unlink(filePath);
      } catch {}
    }
  }

  async findAll(user: { userId: string; role: string }) {
    if (user.role === 'PAYEE') {
      if (!user.userId) {
        throw new Error('Missing payee user ID');
      }

      return this.prisma.verification.findMany({
        where: {
          payee: {
            userId: user.userId, // This assumes `Payee.userId` is unique and maps to the logged-in user
          },
        },
        include: { payee: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    // ADMIN view: Filter out broken `payee` relations
    return this.prisma.verification.findMany({
      where: {
        payee: {
          isNot: undefined,
        },
      },
      include: { payee: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const verification = await this.prisma.verification.findUnique({
      where: { id },
      include: { payee: true },
    });

    if (!verification) throw new NotFoundException('Verification not found');

    return verification;
  }
}
