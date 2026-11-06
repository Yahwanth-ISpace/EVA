import { Injectable, Logger } from '@nestjs/common';
import { MongoService } from '../mongo/mongo.service';

export type AuditEntry = {
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  actorId?: string | null;
  actorRole?: string | null;
  targetId?: string | null;
  method?: string;
  path?: string;
  statusCode?: number;
  ip?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly mongo: MongoService) {}

  /** Never throws. Request bodies are not recorded so PHI and credentials stay out of the log. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const db = await this.mongo.getDb();
      await db.collection('audit_logs').insertOne({ ...entry, at: new Date() });
    } catch (err) {
      this.logger.error(
        `Audit write failed action=${entry.action} actor=${entry.actorId ?? 'anonymous'}: ${(err as Error).message}`,
      );
    }
  }

  async list(limit = 200) {
    const db = await this.mongo.getDb();
    const rows = await db
      .collection('audit_logs')
      .find({}, { projection: { _id: 0 } })
      .sort({ at: -1 })
      .limit(Math.min(Math.max(limit, 1), 1000))
      .toArray();
    return rows;
  }
}
