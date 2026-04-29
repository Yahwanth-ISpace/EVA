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

/** Full call context pre-loaded at Twilio stream start so EVA can answer
 * TPA identity/verification questions instantly from cached state. */
export interface PayeeCallContext {
  patient: {
    firstName: string;
    lastName: string;
    fullName: string;
    dob: Date | null;
    dobFormatted: string | null;
    ssn: string | null;
  };
  subscriber: {
    firstName: string;
    lastName: string;
    fullName: string;
    dobFormatted: string | null;
  };
  memberId: string | null;
  provider: {
    firstName: string;
    lastName: string;
    fullName: string;
    npi: string | null;
    billingNpi: string | null;
    taxId: string | null;
    specialty: string | null;
  } | null;
  office: {
    name: string;
    city: string;
    state: string;
  } | null;
  payer: {
    companyName: string;
    groupName: string | null;
    groupNumber: string | null;
    planName: string | null;
  } | null;
}

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

      const existingData =
        (existingVerification?.extractedData as Record<
          string,
          string | null
        > | null) ?? {};

      // Merge extracted fields: use new value if provided and meaningful, otherwise keep existing
      const mergedExtracted: Record<string, string | null> = {
        ...existingData,
      };
      if (hasValue(extracted.coverage))
        mergedExtracted.coverage = extracted.coverage;
      else if (existingData.coverage)
        mergedExtracted.coverage = existingData.coverage;
      if (hasValue(extracted.deductible))
        mergedExtracted.deductible = extracted.deductible;
      else if (existingData.deductible)
        mergedExtracted.deductible = existingData.deductible;
      if (hasValue(extracted.copay)) mergedExtracted.copay = extracted.copay;
      else if (existingData.copay) mergedExtracted.copay = existingData.copay;
      if (hasValue(extracted.validity))
        mergedExtracted.validity = extracted.validity;
      else if (existingData.validity)
        mergedExtracted.validity = existingData.validity;

      const updateData: {
        transcript: string;
        extractedData: Record<string, string | null>;
      } = {
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
    extracted:
      | Record<string, string | null | undefined>
      | {
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
  static readonly LEGACY_KEYS = [
    'coverage',
    'deductible',
    'copay',
    'validity',
  ] as const;

  /**
   * Merge extracted insurance data into the current verification for a payee (used by media-stream flow).
   * Finds or creates a recent verification and updates only the provided fields; optionally appends transcript.
   * When verificationRequirementId is set, stores full extracted in extractedData (Json); legacy keys are also set when present.
   */
  async mergeExtractedData(
    payeeId: string,
    extracted:
      | Partial<{
          coverage: string | null;
          deductible: string | null;
          copay: string | null;
          validity: string | null;
        }>
      | Record<string, string | null | undefined>,
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

    const existingData =
      (existing?.extractedData as Record<string, string | null> | null) ?? {};
    const merged: Record<string, string | null> = { ...existingData };
    for (const [k, v] of Object.entries(
      extracted as Record<string, string | null | undefined>,
    )) {
      if (hasValue(v)) {
        merged[k] = String(v).trim();
      } else if (
        existingData[k] != null &&
        String(existingData[k]).trim().length > 0
      ) {
        merged[k] = existingData[k];
      }
    }

    const updatePayload: {
      transcript?: string;
      extractedData: Record<string, string | null>;
      verificationRequirementId?: string | null;
    } = {
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
  async getExtractedForResponse(
    verificationId: string,
  ): Promise<Record<string, string | null>> {
    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
      include: { verificationRequirement: true },
    });
    if (!verification) throw new NotFoundException('Verification not found');
    const data =
      (verification.extractedData as Record<string, string | null>) ?? {};
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
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  /**
   * Pre-fetch the full identity context the TPA is likely to quiz us on at the start of the call
   * (provider NPI / Tax ID, member ID, patient name + DOB, provider name, subscriber name + DOB).
   * Called once when the Twilio Media Stream opens so EVA can answer each verification question
   * immediately without an extra DB round-trip or extra LLM "thinking".
   *
   * Fields not in the schema today fall back to env vars:
   *   - Member ID:          EVA_MEMBER_ID (or per-payer later)
   *   - Provider Tax ID:    EVA_PROVIDER_TAX_ID
   *   - Billing Provider NPI: EVA_BILLING_PROVIDER_NPI (falls back to rendering NPI)
   * Subscriber defaults to the patient (common in dental) unless overridden via env.
   */
  async getPayeeCallContext(
    payeeId: string,
    appointmentId?: string | null,
  ): Promise<PayeeCallContext | null> {
    const payee = await this.prisma.payee.findUnique({
      where: { id: payeeId },
      include: {
        payer: true,
        appointments: {
          orderBy: { date: 'desc' },
          include: { provider: true, office: true },
        },
      },
    });
    if (!payee) return null;

    // Pick the requested appointment if given, else the most recent one.
    const appt =
      (appointmentId?.trim() &&
        payee.appointments.find((a) => a.id === appointmentId.trim())) ||
      payee.appointments[0] ||
      null;

    const patientFullName = `${payee.firstName} ${payee.lastName}`.trim();
    const patientDobFormatted = payee.dob
      ? this.formatDobForSpeech(payee.dob)
      : null;

    const provider = appt?.provider
      ? {
          firstName: appt.provider.firstName,
          lastName: appt.provider.lastName,
          fullName:
            `${appt.provider.firstName} ${appt.provider.lastName}`.trim(),
          npi: appt.provider.npi ?? null,
          billingNpi:
            process.env.EVA_BILLING_PROVIDER_NPI?.trim() ||
            appt.provider.npi ||
            null,
          taxId: process.env.EVA_PROVIDER_TAX_ID?.trim() || null,
          specialty: appt.provider.specialty ?? null,
        }
      : null;

    const office = appt?.office
      ? {
          name: appt.office.name,
          city: appt.office.city,
          state: appt.office.state,
        }
      : null;

    const payer = payee.payer
      ? {
          companyName: payee.payer.companyName,
          groupName: payee.payer.groupName ?? null,
          groupNumber: payee.payer.groupNumber ?? null,
          planName: payee.payer.planName ?? null,
        }
      : null;

    // Subscriber defaults to the patient; override via env if the practice has a different policyholder.
    const subscriberFirstName =
      process.env.EVA_SUBSCRIBER_FIRST_NAME?.trim() || payee.firstName;
    const subscriberLastName =
      process.env.EVA_SUBSCRIBER_LAST_NAME?.trim() || payee.lastName;
    const subscriberDobRaw = process.env.EVA_SUBSCRIBER_DOB?.trim();
    const subscriberDob = subscriberDobRaw
      ? this.tryFormatDateString(subscriberDobRaw)
      : patientDobFormatted;

    return {
      patient: {
        firstName: payee.firstName,
        lastName: payee.lastName,
        fullName: patientFullName,
        dob: payee.dob,
        dobFormatted: patientDobFormatted,
        ssn: payee.ssn ?? null,
      },
      subscriber: {
        firstName: subscriberFirstName,
        lastName: subscriberLastName,
        fullName: `${subscriberFirstName} ${subscriberLastName}`.trim(),
        dobFormatted: subscriberDob,
      },
      memberId: process.env.EVA_MEMBER_ID?.trim() || null,
      provider,
      office,
      payer,
    };
  }

  /** Accept common date inputs ("1985-03-15", "03/15/1985") and return speech-friendly text. */
  private tryFormatDateString(raw: string): string | null {
    if (!raw) return null;
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return null;
    return this.formatDobForSpeech(d);
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
    extracted:
      | Record<string, string | null | undefined>
      | {
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

  /**
   * Parse a transcript and extract verification fields based on EVA's questions.
   * Uses Gemini AI to match fields mentioned in questions to the transcript,
   * then returns a structured JSON with extracted values.
   *
   * @param payeeId The payee/patient ID
   * @param transcriptToAppend The full call transcript (EVA and User dialog)
   * @param verificationRequirementId Optional verification requirement ID to define the fields
   * @returns JSON with payeeId and verificationFields array containing extracted values
   */
  async parseTranscriptForVerification(
    payeeId: string,
    transcriptToAppend?: string,
    verificationRequirementId?: string | null,
    appointmentId?: string | null,
  ): Promise<{
    payeeId: string;
    verificationFields: Array<{
      question: string;
      field: string;
      required: boolean;
      order: number;
      value: string | null;
    }>;
  }> {
    if (!payeeId) {
      throw new BadRequestException('payeeId is required');
    }

    if (!transcriptToAppend || transcriptToAppend.trim().length === 0) {
      throw new BadRequestException('transcriptToAppend is required');
    }

    let fieldsToExtract: Array<{
      question: string;
      field: string;
      required: boolean;
      order: number;
    }> = [];

    // If verification requirement is provided, get the fields from it
    if (verificationRequirementId) {
      const verReq = await this.prisma.verificationRequirement.findUnique({
        where: { id: verificationRequirementId },
      });

      if (!verReq) {
        throw new NotFoundException('VerificationRequirement not found');
      }

      // If verificationFields is stored as JSON array, parse it
      if (
        verReq.verificationFields &&
        Array.isArray(verReq.verificationFields)
      ) {
        fieldsToExtract = (verReq.verificationFields as any[]).map((f, i) => ({
          question: f.question || '',
          field: f.field || '',
          required: f.required ?? true,
          order: f.order ?? i + 1,
        }));
      }
    } else {
      // Use default legacy insurance fields
      fieldsToExtract = [
        {
          question: 'What is the basic coverage?',
          field: 'coverage.basic',
          required: true,
          order: 1,
        },
        {
          question: 'What is the yearly maximum amount deductible?',
          field: 'deductible.YearlyMaxAmount',
          required: true,
          order: 2,
        },
        {
          question: 'What is the Copay?',
          field: 'copay',
          required: true,
          order: 3,
        },
        {
          question: 'What is the Validity?',
          field: 'validity',
          required: true,
          order: 4,
        },
      ];
    }

    // Use Gemini to extract the values from the transcript
    const verificationFields =
      await this.aiService.extractVerificationFieldsFromTranscript(
        transcriptToAppend,
        fieldsToExtract,
      );
    this.logger.log('Extracted verification appointmentId:', appointmentId);
    this.logger.log('Extracted verificationfields:::: {}', verificationFields);
    return {
      payeeId,
      verificationFields,
    };
  }
}
