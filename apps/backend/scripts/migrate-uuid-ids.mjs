/**
 * Rewrites Prisma 6 string UUID `_id` values to ObjectIds so Prisma 8 can decode them.
 * Also rewrites relation fields that stored those ids.
 *
 * External string ids are left unchanged:
 * VerificationRequirement.payeeId, Verification.payeeId, Verification.appointmentId, BotTracker.payeeId.
 *
 * Usage (from apps/backend):
 *   node scripts/migrate-uuid-ids.mjs --dry-run
 *   node scripts/migrate-uuid-ids.mjs
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const dryRun = process.argv.includes('--dry-run');

const steps = [
  { collection: 'User', refs: [] },
  { collection: 'Payer', refs: [] },
  { collection: 'Provider', refs: [] },
  { collection: 'VerificationRequirement', refs: [] },
  { collection: 'Agent', refs: [] },
  { collection: 'BotTracker', refs: [] },
  { collection: 'Payee', refs: [{ field: 'userId', from: 'User' }, { field: 'payerId', from: 'Payer' }] },
  { collection: 'Office', refs: [{ field: 'providerId', from: 'Provider' }] },
  {
    collection: 'Appointment',
    refs: [
      { field: 'providerId', from: 'Provider' },
      { field: 'officeId', from: 'Office' },
    ],
  },
  {
    collection: 'Verification',
    refs: [{ field: 'verificationRequirementId', from: 'VerificationRequirement' }],
  },
];

const idMaps = new Map(steps.map((step) => [step.collection, new Map()]));

function isObjectId(value) {
  return value instanceof ObjectId || value?._bsontype === 'ObjectId';
}

function idKey(value) {
  if (value == null) return null;
  if (isObjectId(value)) return value.toHexString();
  return String(value);
}

function needsObjectId(value) {
  return value != null && !isObjectId(value);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const session = dryRun ? null : client.startSession();
  console.log(`database: ${db.databaseName}`);
  console.log(dryRun ? 'dry run' : 'writing');

  const write = async () => {
    for (const step of steps) {
      const collection = db.collection(step.collection);
      const docs = await collection.find({}).toArray();
      const map = idMaps.get(step.collection);
      let idRewrites = 0;
      let refRewrites = 0;

      for (const doc of docs) {
        const oldKey = idKey(doc._id);
        const nextId = needsObjectId(doc._id) ? new ObjectId() : doc._id;
        if (needsObjectId(doc._id)) {
          map.set(oldKey, nextId);
          idRewrites += 1;
        } else if (oldKey) {
          map.set(oldKey, doc._id);
        }

        const next = { ...doc, _id: nextId };
        let refsChanged = false;
        for (const ref of step.refs) {
          const current = doc[ref.field];
          if (current == null) continue;
          const mapped = idMaps.get(ref.from).get(idKey(current));
          if (mapped && idKey(mapped) !== idKey(current)) {
            next[ref.field] = mapped;
            refsChanged = true;
          } else if (needsObjectId(current) && /^[a-f0-9]{24}$/i.test(String(current))) {
            next[ref.field] = new ObjectId(String(current));
            refsChanged = true;
          }
        }
        if (refsChanged) refRewrites += 1;

        const idChanged = needsObjectId(doc._id);
        if (!idChanged && !refsChanged) continue;
        if (dryRun) continue;

        const options = session ? { session } : {};
        if (idChanged) {
          await collection.deleteOne({ _id: doc._id }, options);
          await collection.insertOne(next, options);
        } else {
          const { _id, ...fields } = next;
          await collection.replaceOne({ _id }, { _id, ...fields }, options);
        }
      }

      console.log(
        `${step.collection}: ${docs.length} docs, ${idRewrites} string _id -> ObjectId, ${refRewrites} reference updates`,
      );
    }
  };

  try {
    if (session) {
      await session.withTransaction(write);
    } else {
      await write();
    }
  } finally {
    await session?.endSession();
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
