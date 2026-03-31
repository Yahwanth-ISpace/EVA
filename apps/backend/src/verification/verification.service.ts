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
        extractedData: {
          coverage: extracted.coverage || null,
          deductible: extracted.deductible ?? null,
          copay: extracted.copay ?? null,
          validity: extracted.validity ?? null,
        },
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
          appointmentId: null,
        },
        orderBy: { createdAt: 'desc' },
        include: { payee: true },
      });

      // Helper function to check if a value is meaningful (not null, undefined, or empty string)
      const hasValue = (value: string | null | undefined): boolean => {
        return value !== null && value !== undefined && value.trim().length > 0;
      };

      const existingData = (existingVerification?.extractedData as Record<string, string | null> | null) ?? {};

      // Merge extracted fields: use new value if provided and meaningful, otherwise keep existing
      const mergedExtracted: Record<string, string | null> = { ...existingData };
      if (hasValue(extracted.coverage)) mergedExtracted.coverage = extracted.coverage;
      else if (existingData.coverage) mergedExtracted.coverage = existingData.coverage;
      if (hasValue(extracted.deductible)) mergedExtracted.deductible = extracted.deductible;
      else if (existingData.deductible) mergedExtracted.deductible = existingData.deductible;
      if (hasValue(extracted.copay)) mergedExtracted.copay = extracted.copay;
      else if (existingData.copay) mergedExtracted.copay = existingData.copay;
      if (hasValue(extracted.validity)) mergedExtracted.validity = extracted.validity;
      else if (existingData.validity) mergedExtracted.validity = existingData.validity;

      const updateData: { transcript: string; extractedData: Record<string, string | null> } = {
        transcript: existingVerification
          ? `${existingVerification.transcript}\n\n---\n\n${transcript}`
          : transcript,
        extractedData: mergedExtracted,
      };

      let record;
      if (existingVerification) {
        record = await this.prisma.verification.update({
          where: { id: existingVerification.id },
          data: updateData,
          include: { payee: true },
        });
      } else {
        record = await this.prisma.verification.create({
          data: {
            payeeId,
            extractedData: {
              coverage: extracted.coverage ?? null,
              deductible: extracted.deductible ?? null,
              copay: extracted.copay ?? null,
              validity: extracted.validity ?? null,
            },
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
      } catch (deleteErr) {
        console.error('Failed to delete file:', deleteErr.message);
      }
    }
  }

  /**
   * Same as verifyFromAudio (find-or-create verification, merge fields) but takes extracted call
   * fields directly instead of an audio file. When verificationRequirementId is set, extracted can be
   * any record of field names → values and is stored in extractedData.
   */
  async verifyFromExtractedCall(
    payeeId: string,
    extracted: Record<string, string | null | undefined> | {
      coverage?: string | null;
      deductible?: string | null;
      copay?: string | null;
      validity?: string | null;
    },
    transcriptToAppend?: string,
    verificationRequirementId?: string | null,
    appointmentId?: string | null,
  ) {
    if (!payeeId) {
      throw new BadRequestException('payeeId is required');
    }
    return this.mergeExtractedData(
      payeeId,
      extracted as Record<string, string | null | undefined>,
      transcriptToAppend,
      verificationRequirementId,
      appointmentId,
    );
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
        include: { payee: true, verificationRequirement: true },
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
      include: { payee: true, verificationRequirement: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Type for extracted verification fields (legacy 4 or dynamic from VerificationRequirement). */
  static readonly LEGACY_KEYS = ['coverage', 'deductible', 'copay', 'validity'] as const;

  /**
   * Merge extracted insurance data into the current verification for a payee (used by media-stream flow).
   * Finds or creates a recent verification and updates only the provided fields; optionally appends transcript.
   * When verificationRequirementId is set, stores full extracted in extractedData (Json); legacy keys are also set when present.
   */
  async mergeExtractedData(
    payeeId: string,
    extracted: Partial<{
      coverage: string | null;
      deductible: string | null;
      copay: string | null;
      validity: string | null;
    }> | Record<string, string | null | undefined>,
    transcriptToAppend?: string,
    verificationRequirementId?: string | null,
    appointmentId?: string | null,
  ) {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
    });
    if (!payee) throw new NotFoundException('Payee not found');

    const apptId = appointmentId?.trim() || null;
    if (apptId) {
      const appt = await this.prisma.appointment.findFirst({
        where: { id: apptId, payeeId },
      });
      if (!appt) {
        throw new BadRequestException(
          'appointmentId does not match this payee or was not found',
        );
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = apptId
      ? await this.prisma.verification.findFirst({
          where: { payeeId, appointmentId: apptId },
          orderBy: { createdAt: 'desc' },
          include: { payee: true },
        })
      : await this.prisma.verification.findFirst({
          where: {
            payeeId,
            createdAt: { gte: oneHourAgo },
            appointmentId: null,
          },
          orderBy: { createdAt: 'desc' },
          include: { payee: true },
        });

    const hasValue = (v: string | null | undefined) =>
      v !== null && v !== undefined && String(v).trim().length > 0;

    const existingData = (existing?.extractedData as Record<string, string | null> | null) ?? {};
    const merged: Record<string, string | null> = { ...existingData };
    for (const [k, v] of Object.entries(extracted as Record<string, string | null | undefined>)) {
      if (hasValue(v)) {
        merged[k] = String(v).trim();
      } else if (existingData[k] != null && String(existingData[k]).trim().length > 0) {
        merged[k] = existingData[k];
      }
    }

    const updatePayload: { transcript?: string; extractedData: Record<string, string | null>; verificationRequirementId?: string | null } = {
      extractedData: merged,
    };
    if (transcriptToAppend?.trim()) {
      updatePayload.transcript = existing
        ? `${existing.transcript}\n\n---\n\n${transcriptToAppend}`
        : transcriptToAppend;
    }
    if (verificationRequirementId) {
      updatePayload.verificationRequirementId = verificationRequirementId;
    }

    if (existing) {
      return this.prisma.verification.update({
        where: { id: existing.id },
        data: updatePayload,
        include: { payee: true },
      });
    }
    const createData = {
      payeeId,
      transcript: updatePayload.transcript ?? transcriptToAppend ?? '',
      extractedData: merged,
      ...(verificationRequirementId && { verificationRequirementId }),
      ...(apptId && { appointmentId: apptId }),
    };
    return this.prisma.verification.create({
      data: createData,
      include: { payee: true },
    });
  }

  async findById(id: string) {
    const verification = await this.prisma.verification.findUnique({
      where: { id },
      include: { payee: true, verificationRequirement: true },
    });

    if (!verification) throw new NotFoundException('Verification not found');

    return verification;
  }

  /**
   * Get extracted data for API response. Uses verification's extractedData keyed by
   * the verification requirement's field names when present; otherwise returns extractedData as-is.
   */
  async getExtractedForResponse(verificationId: string): Promise<Record<string, string | null>> {
    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
      include: { verificationRequirement: true },
    });
    if (!verification) throw new NotFoundException('Verification not found');
    const data = (verification.extractedData as Record<string, string | null>) ?? {};
    const req = verification.verificationRequirement;
    if (req && Array.isArray(req.verificationFields)) {
      const entries = req.verificationFields as { field: string }[];
      const result: Record<string, string | null> = {};
      for (const { field } of entries) {
        result[field] = data[field] ?? null;
      }
      return result;
    }
    return data;
  }

  /**
   * Get patient (payee) info from the database for EVA to use in prompts.
   * Includes all patient-related fields: name, DOB, SSN (for tax ID / SSN when asked).
   */
  async getPayeePatientInfo(payeeId: string): Promise<{
    firstName: string;
    lastName: string;
    fullName: string;
    dob: Date | null;
    dobFormatted: string | null;
    ssn: string | null;
  } | null> {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
      select: { firstName: true, lastName: true, dob: true, ssn: true },
    });
    if (!payee) return null;
    const fullName = `${payee.firstName} ${payee.lastName}`.trim();
    const dobFormatted = payee.dob ? this.formatDobForSpeech(payee.dob) : null;
    return {
      firstName: payee.firstName,
      lastName: payee.lastName,
      fullName,
      dob: payee.dob,
      dobFormatted,
      ssn: payee.ssn ?? null,
    };
  }

  private formatDobForSpeech(d: Date): string {
    const date = new Date(d);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  /**
   * Start a verification record when a call begins (so extracted data can be pushed and updated).
   * Optionally link to a VerificationRequirement (then extractedData will be used for dynamic fields).
   */
  async startVerificationCall(
    payeeId: string,
    verificationRequirementId?: string | null,
    appointmentId?: string | null,
  ): Promise<{ id: string } | null> {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
    });
    if (!payee) return null;
    const apptId = appointmentId?.trim() || undefined;
    const data: {
      payeeId: string;
      transcript: string;
      extractedData: Record<string, never>;
      verificationRequirementId?: string;
      appointmentId?: string;
    } = {
      payeeId,
      transcript: 'Call started.',
      extractedData: {},
    };
    if (verificationRequirementId) {
      data.verificationRequirementId = verificationRequirementId;
    }
    if (apptId) data.appointmentId = apptId;
    const record = await this.prisma.verification.create({
      data,
      select: { id: true },
    });
    return { id: record.id };
  }

  /**
   * Push extracted data to the verification record (finds or creates recent verification for payeeId).
   * Used by media stream and by the push-extracted endpoint.
   * When verificationRequirementId is set, extracted can be any record of field names → values.
   */
  async pushExtractedData(
    payeeId: string,
    extracted: Record<string, string | null | undefined> | {
      coverage?: string | null;
      deductible?: string | null;
      copay?: string | null;
      validity?: string | null;
    },
    transcriptToAppend?: string,
    verificationRequirementId?: string | null,
    appointmentId?: string | null,
  ) {
    return this.mergeExtractedData(
      payeeId,
      extracted,
      transcriptToAppend,
      verificationRequirementId,
      appointmentId,
    );
  }
}
