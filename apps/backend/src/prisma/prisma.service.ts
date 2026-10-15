import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

type QueryPlan = unknown;

export type PrismaDb = {
  orm: Record<string, any>;
  query: {
    from: (collection: string) => any;
  };
  runtime: () => Promise<{
    query: (plan: QueryPlan) => Promise<any[]>;
  }>;
  close: () => Promise<void>;
};

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private dbPromise: Promise<PrismaDb> | null = null;

  client(): Promise<PrismaDb> {
    if (!this.dbPromise) {
      this.dbPromise = this.open();
    }
    return this.dbPromise;
  }

  async onModuleDestroy() {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    await db.close();
    this.dbPromise = null;
  }

  withIds<T>(value: T): T {
    return mapIds(value) as T;
  }

  private async open(): Promise<PrismaDb> {
    const contractJson = JSON.parse(
      readFileSync(join(process.cwd(), 'prisma', 'contract.json'), 'utf8'),
    );
    const loaded = await import('@prisma/orm-mongo/runtime');
    const mongo = (loaded.default ?? loaded) as unknown as (options: {
      contractJson: unknown;
      url?: string;
    }) => PrismaDb;
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    return mongo({ contractJson, url });
  }
}

export function isDuplicateKey(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const error = err as { code?: unknown; message?: unknown; cause?: unknown };
  if (error.code === 11000 || error.code === '11000') return true;
  if (typeof error.message === 'string' && error.message.includes('E11000')) {
    return true;
  }
  return isDuplicateKey(error.cause);
}

function mapIds(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(mapIds);
  const bson = value as { _bsontype?: string; toHexString?: () => string };
  if (bson._bsontype === 'ObjectId' && typeof bson.toHexString === 'function') {
    return bson.toHexString();
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = mapIds(child);
  }
  if (out._id != null) out.id = String(out._id);
  return out;
}
