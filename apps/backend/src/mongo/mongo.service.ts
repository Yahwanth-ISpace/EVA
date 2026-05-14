import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Collection, Document, MongoClient, Db } from 'mongodb';

/** Mongo collection that holds Sabrina / scheduler appointment + patient + payer + office + provider denormalized documents. */
export const DEFAULT_APPOINTMENTS_COLLECTION = 'appointments';
export const SUBRINA_APPOINTMENTS_COLLECTION = 'sabrina_appointments';
export const SUBRINA_RESPONSE_COLLECTION = 'sabrina_response';

@Injectable()
export class MongoService implements OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private mongoClient?: MongoClient;
  private mongoDb?: Db;

  getAppointmentsCollectionName(): string {
    const name = process.env.MONGO_APPOINTMENTS_COLLECTION?.trim();
    return name || DEFAULT_APPOINTMENTS_COLLECTION;
  }
  getSubrinaAppointmentsCollectionName(): string {
    const name = process.env.MONGO_SUBRINA_APPOINTMENTS_COLLECTION?.trim();
    return name || SUBRINA_APPOINTMENTS_COLLECTION;
  }

  getSubrinaResponseCollectionName(): string {
    const name = process.env.MONGO_SUBRINA_RESPONSE_COLLECTION?.trim();
    return name || SUBRINA_RESPONSE_COLLECTION;
  }

  async appointmentsCollection(): Promise<Collection<Document>> {
    const db = await this.getDb();
    return db.collection(this.getAppointmentsCollectionName());
  }

  async subrinaAppointmentsCollection(): Promise<Collection<Document>> {
    const db = await this.getDb();
    return db.collection(this.getSubrinaAppointmentsCollectionName());
  }

  async subrinaResponseCollection(): Promise<Collection<Document>> {
    const db = await this.getDb();
    return db.collection(this.getSubrinaResponseCollectionName());
  }

  /** Match either string or numeric `AppointmentID` stored in Mongo. */
  appointmentIdQuery(appointmentId: string): Document {
    const raw = appointmentId.trim();
    const n = Number(raw);
    const variants: (string | number)[] = [raw];
    if (Number.isFinite(n) && String(n) === raw) {
      variants.push(n);
    }
    return { AppointmentID: { $in: variants } };
  }

  /**
   * Latest matching document for a patient; optionally scoped to a Sabrina `AppointmentID`.
   */
  async findAppointmentDocument(
    patientId: string,
    appointmentBusinessId?: string | null,
  ): Promise<Document | null> {
    const col = await this.appointmentsCollection();
    const pid = patientId.trim();
    if (!pid) return null;

    const base: Document = { PatientID: pid };
    const aid = appointmentBusinessId?.trim();
    if (aid) {
      const withAppt = await col.findOne({
        ...base,
        ...this.appointmentIdQuery(aid),
      });
      if (withAppt) return withAppt;
    }

    return col.findOne(base, {
      sort: { savedAt: -1, AppointmentDate: -1 } as Document,
    });
  }

  async patientHasAppointment(patientId: string): Promise<boolean> {
    const doc = await this.findAppointmentDocument(patientId, null);
    return doc != null;
  }

  /** Distinct `PatientID` values for rows matching the logged-in user's profile (name ± DOB). */
  async findPatientIdsByUserProfile(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
    dobYmd: string | null | undefined,
  ): Promise<string[]> {
    const fn = firstName?.trim();
    const ln = lastName?.trim();
    if (!fn || !ln) return [];

    const col = await this.appointmentsCollection();
    const filter: Document = {
      Patient_FirstName: fn,
      Patient_LastName: ln,
    };
    if (dobYmd?.trim()) {
      filter.Patient_DOB = dobYmd.trim();
    }
    const ids = await col.distinct('PatientID', filter);
    return (ids as unknown[]).filter((x): x is string => typeof x === 'string');
  }

  async findAllAppointmentsSorted(): Promise<Document[]> {
    const col = await this.appointmentsCollection();
    return col
      .find({})
      .sort({ AppointmentDate: 1, savedAt: 1 } as Document)
      .toArray();
  }

  async getSubrinaAppointments(
    payeeId: string,
    appointmentId: string,
  ): Promise<Document | null> {
    const col = await this.subrinaAppointmentsCollection();
    const aid = appointmentId.trim();
    const pid = payeeId.trim();
    if (!aid || !pid) return null;
    const doc = await col.findOne(
      {
        ...this.appointmentIdQuery(aid),
        PatientID: pid,
      },
      {
        sort: { AppointmentDate: -1, savedAt: -1 } as Document,
      },
    );
    return doc;
  }

  async saveSubrinaDebugData(
    payeeId: string,
    appointmentId: string | null,
    subrinaData: Document | null,
  ) {
    try {
      const col = await this.subrinaResponseCollection();

      // Build query to find existing document
      const query: Document = { PatientID: payeeId.trim() };
      if (appointmentId?.trim()) {
        query.AppointmentID = Number(appointmentId.trim());
      }
      this.logger.log(
        'MongoDB query for saving Subrina debug data: ' + JSON.stringify(query),
      );
      // Delete existing documents for this patient/appointment to ensure a fresh record
      await col.deleteMany(query);

      // Remove the original _id from the source data to allow MongoDB to generate a new one
      const { _id, ...dataToSave } = (subrinaData || {}) as any;

      // Insert new document
      const result = await col.insertOne({
        ...dataToSave,
      });

      this.logger.log(
        `Saved Subrina debug data to MongoDB: ${result.insertedId}`,
      );
    } catch (err) {
      this.logger.error('Error saving Subrina debug data:', err);
    }
  }

  async getDb(): Promise<Db> {
    if (this.mongoDb) {
      return this.mongoDb;
    }

    const uri = process.env.DATABASE_URL;
    if (!uri) {
      throw new Error(
        'DATABASE_URL is required to connect to MongoDB directly',
      );
    }

    this.mongoClient = new MongoClient(uri);
    await this.mongoClient.connect();
    this.mongoDb = this.mongoClient.db();
    this.logger.log('Connected to MongoDB directly using native MongoClient');
    return this.mongoDb;
  }

  async onModuleDestroy() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.logger.log('MongoDB connection closed');
    }
  }
}
