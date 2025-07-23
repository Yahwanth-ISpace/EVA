import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
        coverage: extracted.coverage,
        deductible: extracted.deductible,
        copay: extracted.copay,
        validity: extracted.validity,
        transcript,
      },
      include: { payee: true },
    });
  }

  async verifyFromAudio(payeeId: string, filePath: string) {
    if (!payeeId) throw new Error('payeeId is required');

    const { transcript, error } =
      await this.transcriptionService.transcribeAudio(filePath);
    if (error) throw new Error(error);

    const extracted = await this.aiService.extractInsuranceDetails(transcript);

    return this.prisma.verification.create({
      data: {
        payeeId,
        coverage: extracted.coverage,
        deductible: extracted.deductible,
        copay: extracted.copay,
        validity: extracted.validity,
        transcript,
      },
      include: { payee: true },
    });
  }

  async findAll(user: { userId: string; role: string }) {
    if (user.role === 'PAYEE') {
      if (!user.userId) {
        throw new Error('Missing payee user ID');
      }

      return this.prisma.verification.findMany({
        where: { payeeId: user.userId },
        include: { payee: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    // If ADMIN
    return this.prisma.verification.findMany({
      include: { payee: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const verification = await this.prisma.verification.findUnique({
      where: { id },
      include: { payee: true },
    });

    if (!verification) throw new NotFoundException('Verification not found');

    return verification;
  }
}
