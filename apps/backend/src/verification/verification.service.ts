import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TranscriptionService } from 'src/transcription/transcription.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

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

  async verifyFromAudio(filePath: string, payeeId: string) {
    if (!payeeId) {
      throw new BadRequestException('payeeId is required');
    }
    if (!filePath) {
      throw new BadRequestException('filePath is required but was undefined');
    }
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('Uploaded audio file not found on server');
    }

    try {
      // 1. TRANSCRIBE AUDIO
      const { transcript } =
        await this.transcriptionService.transcribeAudio(filePath);

      if (!transcript || transcript.trim().length === 0) {
        throw new BadRequestException('Transcription failed: empty transcript');
      }

      // 2. EXTRACT INSURANCE DATA
      const extracted =
        await this.aiService.extractInsuranceDetails(transcript);

      if (!extracted) {
        throw new BadRequestException('AI failed to extract insurance details');
      }

      // 3. FIND OR CREATE VERIFICATION RECORD
      // Find the most recent verification for this payeeId (within the last hour to avoid merging old calls)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const existingVerification = await this.prisma.verification.findFirst({
        where: {
          payeeId,
          createdAt: {
            gte: oneHourAgo, // Only consider recent verifications (within last hour)
          },
        },
        orderBy: { createdAt: 'desc' },
        include: { payee: true },
      });

      // Helper function to check if a value is meaningful (not null, undefined, or empty string)
      const hasValue = (value: string | null | undefined): boolean => {
        return value !== null && value !== undefined && value.trim().length > 0;
      };

      // Prepare update data - merge new values with existing ones
      // Only update fields that have new meaningful values (don't null out existing values)
      const updateData: any = {
        transcript: existingVerification
          ? `${existingVerification.transcript}\n\n---\n\n${transcript}`
          : transcript,
      };

      // Merge coverage: use new value if provided and meaningful, otherwise keep existing
      if (hasValue(extracted.coverage)) {
        updateData.coverage = extracted.coverage;
      } else if (existingVerification?.coverage) {
        updateData.coverage = existingVerification.coverage;
      }

      // Merge deductible: use new value if provided and meaningful, otherwise keep existing
      if (hasValue(extracted.deductible)) {
        updateData.deductible = extracted.deductible;
      } else if (existingVerification?.deductible) {
        updateData.deductible = existingVerification.deductible;
      }

      // Merge copay: use new value if provided and meaningful, otherwise keep existing
      if (hasValue(extracted.copay)) {
        updateData.copay = extracted.copay;
      } else if (existingVerification?.copay) {
        updateData.copay = existingVerification.copay;
      }

      // Merge validity: use new value if provided and meaningful, otherwise keep existing
      if (hasValue(extracted.validity)) {
        updateData.validity = extracted.validity;
      } else if (existingVerification?.validity) {
        updateData.validity = existingVerification.validity;
      }

      console.log('Merged data:', {
        coverage: updateData.coverage,
        deductible: updateData.deductible,
        copay: updateData.copay,
        validity: updateData.validity,
        transcriptLength: updateData.transcript?.length,
        isUpdate: !!existingVerification,
      });

      let record;
      if (existingVerification) {
        // UPDATE existing record
        console.log(
          `Updating existing verification ${existingVerification.id} for payeeId: ${payeeId}`,
        );
        record = await this.prisma.verification.update({
          where: { id: existingVerification.id },
          data: updateData,
          include: { payee: true },
        });
      } else {
        // CREATE new record
        console.log(`Creating new verification for payeeId: ${payeeId}`);
        record = await this.prisma.verification.create({
          data: {
            payeeId,
            coverage: extracted.coverage ?? null,
            deductible: extracted.deductible ?? null,
            copay: extracted.copay ?? null,
            validity: extracted.validity ?? null,
            transcript: transcript,
          },
          include: { payee: true },
        });
      }

      return record;
    } catch (err) {
      console.error('verifyFromAudio error:', err);
      throw err;
    } finally {
      // 4. DELETE TEMP FILE
      try {
        await fs.promises.unlink(filePath);
        console.log('Deleted temp audio file:', filePath);
      } catch (deleteErr) {
        console.error('Failed to delete file:', deleteErr.message);
      }
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

  /**
   * Merge extracted insurance data into the current verification for a payee (used by media-stream flow).
   * Finds or creates a recent verification and updates only the provided fields; optionally appends transcript.
   */
  async mergeExtractedData(
    payeeId: string,
    extracted: Partial<{
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    }>,
    transcriptToAppend?: string,
  ) {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
    });
    if (!payee) throw new NotFoundException('Payee not found');

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await this.prisma.verification.findFirst({
      where: { payeeId, createdAt: { gte: oneHourAgo } },
      orderBy: { createdAt: 'desc' },
      include: { payee: true },
    });

    const hasValue = (v: string | null | undefined) =>
      v !== null && v !== undefined && String(v).trim().length > 0;

    const updateData: any = {};
    if (transcriptToAppend?.trim()) {
      updateData.transcript = existing
        ? `${existing.transcript}\n\n---\n\n${transcriptToAppend}`
        : transcriptToAppend;
    }
    for (const key of ['coverage', 'deductible', 'copay', 'validity'] as const) {
      const val = extracted[key];
      if (hasValue(val)) {
        updateData[key] = val;
      } else if (existing && (existing[key] ?? '').toString().trim()) {
        updateData[key] = existing[key];
      }
    }

    if (existing) {
      return this.prisma.verification.update({
        where: { id: existing.id },
        data: updateData,
        include: { payee: true },
      });
    }
    return this.prisma.verification.create({
      data: {
        payeeId,
        coverage: updateData.coverage ?? null,
        deductible: updateData.deductible ?? null,
        copay: updateData.copay ?? null,
        validity: updateData.validity ?? null,
        transcript: updateData.transcript ?? transcriptToAppend ?? '',
      },
      include: { payee: true },
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

  /**
   * Get patient (payee) info for the call so EVA can disclose full name and DOB when asked.
   */
  async getPayeePatientInfo(payeeId: string): Promise<{
    firstName: string;
    lastName: string;
    dob: Date | null;
  } | null> {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
      select: { firstName: true, lastName: true, dob: true },
    });
    if (!payee) return null;
    return {
      firstName: payee.firstName,
      lastName: payee.lastName,
      dob: payee.dob,
    };
  }

  /**
   * Start a verification record when a call begins (so extracted data can be pushed and updated).
   */
  async startVerificationCall(payeeId: string): Promise<{ id: string } | null> {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
    });
    if (!payee) return null;
    const record = await this.prisma.verification.create({
      data: {
        payeeId,
        transcript: 'Call started.',
        coverage: null,
        deductible: null,
        copay: null,
        validity: null,
      },
      select: { id: true },
    });
    return { id: record.id };
  }

  /**
   * Push extracted data to the verification record (finds or creates recent verification for payeeId).
   * Used by media stream and by the push-extracted endpoint.
   */
  async pushExtractedData(
    payeeId: string,
    extracted: {
      coverage?: string | null;
      deductible?: string | null;
      copay?: string | null;
      validity?: string | null;
    },
    transcriptToAppend?: string,
  ) {
    this.logger.log('pushExtractedData: payeeId=' + payeeId + ' data=' + JSON.stringify(extracted));
    return this.mergeExtractedData(payeeId, extracted, transcriptToAppend);
  }
}
