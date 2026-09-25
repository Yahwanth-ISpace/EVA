import { ObjectId } from 'mongodb';

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function resolveId(doc: Record<string, unknown>): string {
  if (doc.id != null && String(doc.id).trim()) return String(doc.id);
  const raw = doc._id;
  if (raw instanceof ObjectId) return raw.toHexString();
  if (raw != null && String(raw).trim()) return String(raw);
  if (doc.appointmentId != null) return String(doc.appointmentId);
  return '';
}

/** Map Mongo scheduler appointment documents to the shape the React dashboard expects. */
export function mapMongoAppointmentToClient(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  if (
    doc.payeeId &&
    doc.payee &&
    typeof doc.payee === 'object' &&
    doc.id
  ) {
    return doc;
  }

  const patient =
    doc.patient && typeof doc.patient === 'object'
      ? (doc.patient as Record<string, unknown>)
      : {};
  const provider =
    doc.provider && typeof doc.provider === 'object'
      ? (doc.provider as Record<string, unknown>)
      : {};
  const office =
    doc.office && typeof doc.office === 'object'
      ? (doc.office as Record<string, unknown>)
      : {};

  const patientId = String(
    patient.patientId ?? doc.PatientID ?? doc.patientId ?? '',
  ).trim();
  const { firstName: pFirst, lastName: pLast } = splitName(
    String(patient.patientName ?? ''),
  );
  const { firstName: prFirst, lastName: prLast } = splitName(
    String(provider.providerName ?? ''),
  );

  const savedAt = doc.savedAt ?? doc.createdAt ?? new Date().toISOString();
  const appointmentDate =
    doc.appointmentDate ?? doc.date ?? savedAt;

  return {
    ...doc,
    id: resolveId(doc),
    appointmentId:
      doc.appointmentId != null ? String(doc.appointmentId) : undefined,
    payeeId: patientId,
    patientId,
    providerId: String(provider.providerId ?? ''),
    officeId: String(office.officeID ?? office.officeId ?? ''),
    date: appointmentDate,
    reason: String(doc.eligibilityResult ?? doc.reason ?? ''),
    status: doc.status ?? 'SCHEDULED',
    createdAt: savedAt,
    updatedAt: savedAt,
    notes: String(doc.AppointmentNote ?? doc.notes ?? ''),
    payee: {
      id: patientId,
      userId: '',
      firstName: pFirst,
      lastName: pLast,
      dob: String(patient.patientDOB ?? patient.dob ?? ''),
      ssn: '',
      payerId: '',
      data: null,
    },
    provider: {
      id: String(provider.providerId ?? ''),
      name: String(provider.providerName ?? ''),
      firstName: prFirst,
      lastName: prLast,
      specialty: String(provider.providerSpecialty ?? ''),
      npi: String(provider.providerNpi ?? ''),
      phone: '',
      email: '',
      createdAt: String(savedAt),
      updatedAt: String(savedAt),
    },
    office: {
      id: String(office.officeID ?? office.officeId ?? ''),
      providerId: String(provider.providerId ?? ''),
      name: String(office.name ?? ''),
      address: String(office.address ?? ''),
      city: String(office.city ?? ''),
      state: String(office.state ?? ''),
      zip: String(office.zip ?? office.zipCode ?? ''),
      phone: '',
      createdAt: String(savedAt),
      updatedAt: String(savedAt),
      provider: {} as Record<string, never>,
    },
  };
}
