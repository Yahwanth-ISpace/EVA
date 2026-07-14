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
import { MongoService } from 'src/mongo/mongo.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/** One benefit question from the appointment / requirement payload (ask this verbatim). */
export type PatientVerificationStep = {
  field: string;
  question: string;
  rule: string;
  order: number;
};

/** Full call context pre-loaded at Twilio stream start so EVA can answer
 * TPA identity/verification questions instantly from cached state. */
export interface PatientCallContext {
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
  /** Benefit verification questions from the appointment payload (Sabrina), in ask order. */
  verificationSteps: PatientVerificationStep[];
}

/** @deprecated Use {@link PatientCallContext} */
export type PayeeCallContext = PatientCallContext;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly transcriptionService: TranscriptionService,
    private readonly mongoService: MongoService,
    private readonly httpService: HttpService,
  ) {}

  async simulateVerification(payeeId: string, transcript: string) {
    if (!(await this.mongoService.patientHasAppointment(payeeId))) {
      throw new NotFoundException(
        'Patient not found in appointments collection',
      );
    }

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
      include: { verificationRequirement: true },
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
    if (!(await this.mongoService.patientHasAppointment(payeeId))) {
      throw new NotFoundException(
        'Patient not found in appointments collection',
      );
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
        include: { verificationRequirement: true },
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
          include: { verificationRequirement: true },
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
          include: { verificationRequirement: true },
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

      const u = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { firstName: true, lastName: true, dob: true },
      });
      const dobYmd = u?.dob ? u.dob.toISOString().slice(0, 10) : undefined;
      const patientIds = await this.mongoService.findPatientIdsByUserProfile(
        u?.firstName,
        u?.lastName,
        dobYmd,
      );
      if (patientIds.length === 0) {
        return [];
      }

      return this.prisma.verification.findMany({
        where: { payeeId: { in: patientIds } },
        include: { verificationRequirement: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    return this.prisma.verification.findMany({
      include: { verificationRequirement: true },
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
    // if (!(await this.mongoService.patientHasAppointment(payeeId))) {
    //   throw new NotFoundException(
    //     'Patient not found in appointments collection',
    //   );
    // }

    const apptId = appointmentId?.trim() || null;
    if (apptId) {
      const row = await this.mongoService.findAppointmentDocument(
        payeeId,
        apptId,
      );
      if (!row) {
        throw new BadRequestException(
          'appointmentId does not match this patient or was not found in appointments',
        );
      }
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = apptId
      ? await this.prisma.verification.findFirst({
          where: { payeeId, appointmentId: apptId },
          orderBy: { createdAt: 'desc' },
          include: { verificationRequirement: true },
        })
      : await this.prisma.verification.findFirst({
          where: {
            payeeId,
            createdAt: { gte: oneHourAgo },
            appointmentId: null,
          },
          orderBy: { createdAt: 'desc' },
          include: { verificationRequirement: true },
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
        include: { verificationRequirement: true },
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
      include: { verificationRequirement: true },
    });
  }

  async findById(id: string) {
    const verification = await this.prisma.verification.findUnique({
      where: { id },
      include: { verificationRequirement: true },
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
   * Get patient info for EVA prompts from the Mongo `appointments` document (`patientId` = `PatientID`).
   */
  async getPatientInfo(patientId: string): Promise<{
    firstName: string;
    lastName: string;
    fullName: string;
    dob: Date | null;
    dobFormatted: string | null;
    ssn: string | null;
  } | null> {
    const doc = await this.mongoService.findAppointmentDocument(
      patientId,
      null,
    );
    if (!doc) return null;
    const fn = String(doc.Patient_FirstName ?? '');
    const ln = String(doc.Patient_LastName ?? '');
    const dob = this.parseAppointmentDob(doc.Patient_DOB);
    const dobFormatted = dob ? this.formatDobForSpeech(dob) : null;
    return {
      firstName: fn,
      lastName: ln,
      fullName: `${fn} ${ln}`.trim(),
      dob,
      dobFormatted,
      ssn:
        doc.SSN != null && String(doc.SSN).trim() !== ''
          ? String(doc.SSN)
          : null,
    };
  }

  private parseAppointmentDob(raw: unknown): Date | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
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

  private tryFormatDateString(raw: string): string | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return null;
    return this.formatDobForSpeech(parsed);
  }

  /**
   * Pre-fetch identity + benefit-question context from Mongo `appointments` (`patientId` = `PatientID`).
   */
  async getPatientCallContext(
    patientId: string,
    appointmentId: string | null,
  ): Promise<PatientCallContext | null> {
    const doc = await this.mongoService.findAppointmentDocument(
      patientId,
      appointmentId,
    );
    if (!doc) return null;

    const patient = doc.patient ?? {};
    const subscriber = doc.subscriber ?? {};
    const providerDoc = doc.provider ?? {};
    const officeDoc = doc.office ?? {};
    const insuranceDoc = doc.insurance ?? {};

    const patientDob = this.parseAppointmentDob(patient.patientDOB);
    const patientDobFormatted = patientDob
      ? this.formatDobForSpeech(patientDob)
      : null;

    const subscriberDob = this.parseAppointmentDob(subscriber.subscriberDOB);
    const subscriberDobFormatted = subscriberDob
      ? this.formatDobForSpeech(subscriberDob)
      : null;

    const providerName = String(providerDoc.providerName ?? '').trim();
    const providerNameParts = providerName.split(/\s+/);

    const provider =
      providerName || providerDoc.providerId
        ? {
            firstName: providerNameParts[0] ?? '',
            lastName: providerNameParts.slice(1).join(' '),
            fullName: providerName,
            npi: providerDoc.providerId ? String(providerDoc.providerId) : null,
            billingNpi:
              process.env.EVA_BILLING_PROVIDER_NPI?.trim() ||
              (providerDoc.providerId ? String(providerDoc.providerId) : null),
            taxId:
              process.env.EVA_PROVIDER_TAX_ID?.trim() ||
              (providerDoc.providerTaxId
                ? String(providerDoc.providerTaxId)
                : null),
            specialty: null,
          }
        : null;

    const office =
      officeDoc.name || officeDoc.address
        ? {
            name: String(officeDoc.name ?? ''),
            city: '',
            state: '',
          }
        : null;

    const payer =
      insuranceDoc.companyName || insuranceDoc.groupNumber
        ? {
            companyName: String(insuranceDoc.companyName ?? ''),
            groupName: null,
            groupNumber: insuranceDoc.groupNumber
              ? String(insuranceDoc.groupNumber)
              : null,
            planName: null,
          }
        : null;

    const subscriberId =
      subscriber.subscriberId != null &&
      String(subscriber.subscriberId).trim() !== ''
        ? String(subscriber.subscriberId).trim()
        : null;

    const memberId =
      patient.memberId != null && String(patient.memberId).trim() !== ''
        ? String(patient.memberId).trim()
        : subscriberId || process.env.EVA_MEMBER_ID?.trim() || null;

    const subscriberName = String(subscriber.subscriberName ?? '').trim();
    const subscriberNameParts = subscriberName.split(/\s+/);

    const subscriberFirstName =
      subscriberNameParts[0] ??
      process.env.EVA_SUBSCRIBER_FIRST_NAME?.trim() ??
      '';

    const subscriberLastName =
      subscriberNameParts.slice(1).join(' ') ||
      process.env.EVA_SUBSCRIBER_LAST_NAME?.trim() ||
      '';

    const subscriberDobRaw = process.env.EVA_SUBSCRIBER_DOB?.trim();

    const finalSubscriberDobFormatted = subscriberDobRaw
      ? this.tryFormatDateString(subscriberDobRaw)
      : subscriberDobFormatted || patientDobFormatted;

    const verificationSteps = this.verificationStepsFromAppointmentDoc(
      doc as Record<string, unknown>,
    );

    this.logger.log(
      `Verification Steps: ${JSON.stringify(verificationSteps, null, 2)}`,
    );

    const patientName = String(patient.patientName ?? '').trim();
    const nameSlice = patientName.split(/\s+/);

    return {
      patient: {
        firstName: nameSlice[0] ?? '',
        lastName: nameSlice.slice(1).join(' '),
        fullName: patientName,
        dob: patientDob,
        dobFormatted: patientDobFormatted,
        ssn:
          doc.SSN != null && String(doc.SSN).trim() !== ''
            ? String(doc.SSN)
            : null,
      },
      subscriber: {
        firstName: subscriberFirstName,
        lastName: subscriberLastName,
        fullName: subscriberName,
        dobFormatted: finalSubscriberDobFormatted,
      },
      memberId,
      provider,
      office,
      payer,
      verificationSteps,
    };
  }

  /** @deprecated Use {@link getPatientCallContext} */
  async getPayeeCallContext(
    patientId: string,
    appointmentId: string | null,
  ): Promise<PatientCallContext | null> {
    return this.getPatientCallContext(patientId, appointmentId);
  }

  /** @deprecated Use {@link getPatientInfo} */
  async getPayeePatientInfo(patientId: string) {
    return this.getPatientInfo(patientId);
  }

  private verificationStepsFromAppointmentDoc(
    doc: Record<string, unknown>,
  ): PatientVerificationStep[] {
    const steps: PatientVerificationStep[] = [];

    /**
     * ----------------------------
     * Priority 1: verificationFields
     * ----------------------------
     */
    const raw = doc['verificationFields'];

    if (Array.isArray(raw) && raw.length > 0) {
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i] as Record<string, unknown>;

        const field = String(item.field ?? '').trim();
        if (!field) continue;

        const question = String(item.question ?? '').trim();
        const rule = String(item.rule ?? '').trim();

        const order =
          typeof item.order === 'number' && Number.isFinite(item.order)
            ? item.order
            : i + 1;

        steps.push({
          field,
          question: question || field,
          rule,
          order,
        });
      }

      steps.sort((a, b) => a.order - b.order);
      this.logger.debug(
        `Verification Steps: ${JSON.stringify(steps, null, 2)}`,
      );
      return steps;
    }

    /**
     * ----------------------------
     * Fallback: benefitsInfo
     * ----------------------------
     */
    const benefitsInfo = doc['benefitsInfo'];

    if (
      benefitsInfo &&
      typeof benefitsInfo === 'object' &&
      !Array.isArray(benefitsInfo)
    ) {
      let order = 1;

      for (const [field, value] of Object.entries(
        benefitsInfo as Record<string, unknown>,
      )) {
        if (!value || typeof value !== 'object') continue;

        const benefit = value as Record<string, unknown>;

        steps.push({
          field,
          question: String(benefit.question ?? '').trim() || field,
          rule: String(benefit.rule ?? '').trim(),
          order,
        });

        order++;
      }

      steps.sort((a, b) => a.order - b.order);
      this.logger.debug(
        `Verification Steps: ${JSON.stringify(steps, null, 2)}`,
      );
      return steps;
    }

    this.logger.debug(`Verification Steps: ${JSON.stringify(steps, null, 2)}`);
    return [];
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private normalizeAnswerForQuestion(
    question: string,
    answer: string | string[],
  ): string | string[] {
    if (!AiService.isGroupNameQuestion(question)) return answer;
    if (Array.isArray(answer)) {
      return answer
        .map((v) => this.aiService.extractGroupNameFromAnswer(String(v)))
        .filter(Boolean);
    }
    return this.aiService.extractGroupNameFromAnswer(String(answer));
  }

  private hasSabrinaAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (Array.isArray(value)) {
      return value.some((v) => String(v).trim().length > 0);
    }
    const s = String(value).trim();
    return s.length > 0 && !/^skipped\b/i.test(s);
  }

  private isPatientNotFoundInTranscript(transcript: string): boolean {
    const t = transcript.toLowerCase();
    return (
      /\b(patient|member|subscriber)\s+(is\s+)?not\s+found\b/.test(t) ||
      /\b(no|not)\s+(patient|member|subscriber)\s+(on\s+file|in\s+(the\s+)?system|found)\b/.test(
        t,
      ) ||
      /\b(can'?t|cannot)\s+find\s+(the\s+)?(patient|member|subscriber)\b/.test(
        t,
      ) ||
      /\bwe\s+don'?t\s+have\s+(that\s+)?(patient|member|subscriber)\b/.test(
        t,
      ) ||
      /\bno\s+record\s+(for|of)\s+(this\s+)?(patient|member|subscriber)\b/.test(
        t,
      )
    );
  }

  private areAllSabrinaFieldsComplete(doc: Record<string, any>): boolean {
    for (const value of Object.values(doc)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const nested = value as Record<string, any>;
      if (
        typeof nested.question === 'string' &&
        Object.prototype.hasOwnProperty.call(nested, 'answer')
      ) {
        if (!this.hasSabrinaAnswer(nested.answer)) return false;
      }
    }

    const history = Array.isArray(doc.history) ? doc.history : [];
    for (const item of history) {
      if (!item || typeof item !== 'object') continue;
      const historyItem = item as Record<string, any>;
      if (typeof historyItem.question !== 'string') continue;
      const hist = historyItem.history;
      if (!Array.isArray(hist) || hist.length === 0) return false;
    }

    return true;
  }

  private computeSabrinaResponseStatus(
    doc: Record<string, any> | null,
    transcript: string,
  ): 'Complete' | 'Incomplete' | 'Not Found' {
    if (this.isPatientNotFoundInTranscript(transcript)) return 'Not Found';
    if (!doc) return 'Incomplete';
    if (this.areAllSabrinaFieldsComplete(doc)) return 'Complete';
    return 'Incomplete';
  }

  private mapSubrinaAnswers(
    verificationFields: Array<Record<string, unknown>>,
    sabrinaData: any,
  ): void {
    if (
      !sabrinaData ||
      typeof sabrinaData !== 'object' ||
      Array.isArray(sabrinaData)
    ) {
      return;
    }

    // const doc = sabrinaData as Record<string, unknown>;
    const verificationByQuestion = new Map<string, string | string[]>();
    for (const field of verificationFields) {
      const question = field.question;
      const answer = field.answar ?? field.answer ?? field.value;
      if (typeof question === 'string' && answer != null) {
        verificationByQuestion.set(
          this.normalizeText(question),
          answer as string | string[],
        );
      }
    }

    const setSubrinaAnswer = (
      target: Record<string, any>,
      targetQuestion: any,
      isHistory,
    ) => {
      if (typeof targetQuestion !== 'string') return false;
      const normalizedTargetQuestion = this.normalizeText(targetQuestion);
      const match = [...verificationByQuestion.entries()].find(
        ([key]) =>
          key === normalizedTargetQuestion ||
          key.includes(normalizedTargetQuestion) ||
          normalizedTargetQuestion.includes(key),
      );
      if (match) {
        const val = this.normalizeAnswerForQuestion(targetQuestion, match[1]);
        if (isHistory) {
          if (Array.isArray(val)) {
            target.history.push(...val);
          } else {
            const parts = String(val)
              .split(/\s+and\s+|(?<=\d{4}),\s*/i)
              .map((s) => s.trim())
              .filter(Boolean);
            target.history.push(...parts);
          }
        } else {
          target.answer = Array.isArray(val) ? val.join(', ') : val;
        }
        return true;
      }
      return false;
    };

    const doc = sabrinaData as Record<string, any>;
    for (const value of Object.values(doc)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const nested = value as Record<string, any>;
      setSubrinaAnswer(nested, nested.question, false);
    }

    const history = Array.isArray(doc.history) ? doc.history : [];
    for (const item of history) {
      if (!item || typeof item !== 'object') continue;
      const historyItem = item as Record<string, any>;
      historyItem.history = [];
      setSubrinaAnswer(historyItem, historyItem.question, true);
    }
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
    if (!(await this.mongoService.patientHasAppointment(payeeId))) {
      return null;
    }
    const apptId = appointmentId?.trim() || undefined;
    if (apptId) {
      const row = await this.mongoService.findAppointmentDocument(
        payeeId,
        apptId,
      );
      if (!row) return null;
    }
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

  private buildEligibilityPayload(
    appointment: any,
    extracted?: Record<string, string | null | undefined>,
  ) {
    return {
      ...appointment,
      benefitsInfo: Object.fromEntries(
        Object.keys(appointment.benefitsInfo ?? {}).map((key) => [
          key,
          extracted?.[key] ?? '',
        ]),
      ),
    };
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
    extracted?:
      | Record<string, string | null | undefined>
      | {
          coverage?: string | null;
          deductible?: string | null;
          copay?: string | null;
          validity?: string | null;
        },
    transcriptToAppend?: string | null,
    verificationRequirementId?: string | null,
    appointmentId?: string | null,
  ): Promise<any> {
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
    this.logger.log(
      'Parsing transcript for verification with payeeId: {}',
      payeeId,
    );
    this.logger.log('Transcript to append: {}', transcriptToAppend);

    this.logger.log('Appointment ID: {}', appointmentId);
    this.logger.log('Extracted data: {}', extracted);
    // If verification requirement is provided, get the fields from it
    if (extracted) {
      const verReq = Object.keys(extracted);
      // If verificationFields is stored as JSON array, parse it
      if (verReq && Array.isArray(verReq)) {
        fieldsToExtract = (verReq as any[]).map((f, i) => ({
          question: '',
          field: f || '',
          required: true,
          order: i + 1,
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
    let verificationFields =
      await this.aiService.extractVerificationFieldsFromTranscript(
        transcriptToAppend,
        fieldsToExtract,
      );
    const sabrinaData = await this.mongoService.getSubrinaAppointments(
      payeeId,
      appointmentId?.trim() || '',
    );
    if (sabrinaData) {
      this.mapSubrinaAnswers(verificationFields, sabrinaData);
      (sabrinaData as Record<string, unknown>).status =
        this.computeSabrinaResponseStatus(
          sabrinaData as Record<string, any>,
          transcriptToAppend,
        );
    }
    // this.logger.log(sabrinaData);

    //save sabrinaData to mongo collection for debugging
    await this.mongoService.saveSubrinaDebugData(
      payeeId,
      appointmentId?.trim() || null,
      sabrinaData,
    );

    const appointment = await this.mongoService.findAppointmentDocument(
      payeeId,
      appointmentId?.trim() || null,
    );

    const payload = this.buildEligibilityPayload(appointment, extracted);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Ocp-Apim-Subscription-Key': process.env.SABRINA_SUBSCRIPTION_KEY,
    };

    this.logger.log(`Eligibility Payload: ${JSON.stringify(payload, null, 2)}`);

    await firstValueFrom(
      this.httpService.post(
        'https://sabrinauatapi.ispace.com/api/appointments/SaveEligibility',
        payload,
        {
          headers,
        },
      ),
    );

    return sabrinaData;
  }
}
