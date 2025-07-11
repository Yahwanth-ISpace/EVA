import { Injectable } from '@nestjs/common';
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

  async simulateVerification(patientId: string, transcript: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new Error('Patient not found');

    const extracted = await this.aiService.extractInsuranceDetails(transcript);

    return this.prisma.verification.create({
      data: {
        patientId,
        ...extracted,
      },
    });
  }

  async verifyFromAudio(patientId: string, filePath: string) {
  const { transcript, error } = await this.transcriptionService.transcribeAudio(filePath);
  if (error) throw new Error(error);

  const extracted = await this.aiService.extractInsuranceDetails(transcript);

  return this.prisma.verification.create({
    data: {
      patientId,
      ...extracted,
    },
  });
}


  async findAll() {
    return this.prisma.verification.findMany({ include: { patient: true } });
  }
}
