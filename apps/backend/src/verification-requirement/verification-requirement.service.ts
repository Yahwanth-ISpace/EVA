import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MongoService } from '../mongo/mongo.service';
import { CreateVerificationRequirementDto } from './dto/create-verification-requirement.dto';
import { UpdateVerificationRequirementDto } from './dto/update-verification-requirement.dto';
import type { VerificationFieldEntry } from './dto/verification-field.dto';

@Injectable()
export class VerificationRequirementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mongoService: MongoService,
  ) {}

  async create(dto: CreateVerificationRequirementDto) {
    if (!(await this.mongoService.patientHasAppointment(dto.payeeId))) {
      throw new NotFoundException(
        'Patient not found in appointments collection (payeeId path param is PatientID)',
      );
    }
    const verificationFields = dto.verificationFields as VerificationFieldEntry[];
    if (
      !verificationFields?.length ||
      verificationFields.some(
        (f) =>
          !f.field ||
          typeof f.required !== 'boolean' ||
          typeof f.order !== 'number',
      )
    ) {
      throw new BadRequestException(
        'verificationFields must be a non-empty array of { field, required, order }',
      );
    }
    const db = await this.prisma.client();
    const created = await db.orm.VerificationRequirement.create({
      payeeId: dto.payeeId,
      verificationFields: verificationFields as object,
    });
    return this.prisma.withIds(created);
  }

  async findByPayeeId(payeeId: string) {
    if (!(await this.mongoService.patientHasAppointment(payeeId))) {
      throw new NotFoundException(
        'Patient not found in appointments collection (payeeId path param is PatientID)',
      );
    }
    const db = await this.prisma.client();
    return this.prisma.withIds(
      await db.orm.VerificationRequirement.where({ payeeId })
        .orderBy({ createdAt: 1 })
        .all(),
    );
  }

  async findOne(id: string) {
    const db = await this.prisma.client();
    const req = await db.orm.VerificationRequirement.where({ _id: id }).first();
    if (!req) throw new NotFoundException('Verification requirement not found');
    return this.prisma.withIds(req);
  }

  async update(id: string, dto: UpdateVerificationRequirementDto) {
    await this.findOne(id);
    const data: { payeeId?: string; verificationFields?: object } = {};
    if (dto.payeeId != null) {
      if (!(await this.mongoService.patientHasAppointment(dto.payeeId))) {
        throw new NotFoundException(
          'Patient not found in appointments collection (payeeId is PatientID)',
        );
      }
      data.payeeId = dto.payeeId;
    }
    if (dto.verificationFields != null)
      data.verificationFields = dto.verificationFields as object;
    const db = await this.prisma.client();
    const updated = await db.orm.VerificationRequirement.where({ _id: id }).update(
      data,
    );
    return this.prisma.withIds(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    const db = await this.prisma.client();
    return this.prisma.withIds(
      await db.orm.VerificationRequirement.where({ _id: id }).delete(),
    );
  }

  /**
   * Returns ordered list of field names for a payee's verification requirement.
   * Uses the first requirement for the payee if requirementId not provided.
   * If no requirement exists, returns default fields: coverage, deductible, copay, validity.
   */
  async getOrderedFieldsForPayee(
    payeeId: string,
    requirementId?: string | null,
  ): Promise<VerificationFieldEntry[]> {
    if (requirementId) {
      const db = await this.prisma.client();
      const req = await db.orm.VerificationRequirement.where({ _id: requirementId })
        .where({ payeeId })
        .first();
      if (req && Array.isArray(req.verificationFields))
        return (req.verificationFields as VerificationFieldEntry[]).sort(
          (a, b) => (a.order ?? 999) - (b.order ?? 999),
        );
    }
    const db = await this.prisma.client();
    const req = await db.orm.VerificationRequirement.where({ payeeId })
      .orderBy({ createdAt: 1 })
      .first();
    if (req && Array.isArray(req.verificationFields))
      return (req.verificationFields as VerificationFieldEntry[]).sort(
        (a, b) => (a.order ?? 999) - (b.order ?? 999),
      );
    return [
      { field: 'coverage', required: true, order: 1 },
      { field: 'deductible', required: true, order: 2 },
      { field: 'copay', required: true, order: 3 },
      { field: 'validity', required: true, order: 4 },
    ];
  }

  /** Returns just the ordered field names (strings) for a payee. */
  async getOrderedFieldNames(
    payeeId: string,
    requirementId?: string | null,
  ): Promise<string[]> {
    const entries = await this.getOrderedFieldsForPayee(payeeId, requirementId);
    return entries.map((e) => e.field);
  }

  /**
   * Returns ordered field names and the requirement id used (when payee has a requirement).
   * Used by media-stream to know which requirement to attach to the verification record.
   */
  async getOrderedFieldsAndRequirementId(
    payeeId: string,
  ): Promise<{ orderedFields: string[]; requirementId: string | null }> {
    const db = await this.prisma.client();
    const req = await db.orm.VerificationRequirement.where({ payeeId })
      .orderBy({ createdAt: 1 })
      .first();
    if (req && Array.isArray(req.verificationFields)) {
      const entries = (req.verificationFields as VerificationFieldEntry[]).sort(
        (a, b) => (a.order ?? 999) - (b.order ?? 999),
      );
      return {
        orderedFields: entries.map((e) => e.field),
        requirementId: this.prisma.withIds(req).id,
      };
    }
    return {
      orderedFields: ['coverage', 'deductible', 'copay', 'validity'],
      requirementId: null,
    };
  }
}
