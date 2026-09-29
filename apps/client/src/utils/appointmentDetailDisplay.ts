import type { AppointmentRecord } from "../redux/types/appointmentsTypes";
import type { VerificationRecord } from "../redux/types/verificationTypes";
import { humanizeVerificationFieldKey } from "./verificationDisplay";
export type DetailFieldRow = {
  key: string;
  label: string;
  value: string;
  hint?: string;
};

export type DetailSection = {
  id: string;
  title: string;
  subtitle: string;
  fields: DetailFieldRow[];
};

export type CallExtractionRow = {
  fieldKey: string;
  label: string;
  extractedValue: string;
  questionHint?: string;
  filled: boolean;
  category: "mandatory" | "benefit" | "history";
};

export type CallExtractionGroup = {
  id: "mandatory" | "benefits" | "history";
  title: string;
  subtitle: string;
  rows: CallExtractionRow[];
};

function normalizeFieldKeyToken(fieldKey: string): string {
  return fieldKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Aligns with plan-verification fields asked before benefit percentages / history. */
export function classifyCallExtractionField(fieldKey: string): CallExtractionRow["category"] {
  const key = fieldKey.trim();
  if (key.startsWith("history.")) return "history";
  if (key === "history-list") return "mandatory";

  const f = normalizeFieldKeyToken(key);
  if (f === "groupname" || f === "insurancegroupname") return "mandatory";
  if (f === "groupnumber" || f === "insurancegroupnumber") return "mandatory";
  if (f === "relationshipstatus" || f === "relationshiptosubscriber") {
    return "mandatory";
  }
  if (
    f === "effectivedate" ||
    f === "originaleffectivedate" ||
    f === "planeffectivedate" ||
    f === "coverageeffectivedate"
  ) {
    return "mandatory";
  }
  if (/effective\s*date|date\s*effective/i.test(key)) return "mandatory";

  return "benefit";
}

function toCallExtractionRow(
  partial: Omit<CallExtractionRow, "category">,
): CallExtractionRow {
  return {
    ...partial,
    category: classifyCallExtractionField(partial.fieldKey),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function displayValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") {
    const t = value.trim();
    return t || "—";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "—";
}

function formatDateOnly(value: unknown): string {
  const raw = displayValue(value);
  if (raw === "—") return raw;
  try {
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return raw;
  }
}

function formatDateTime(value: unknown): string {
  const raw = displayValue(value);
  if (raw === "—") return raw;
  try {
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw;
    return d.toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

function field(
  key: string,
  label: string,
  value: unknown,
  hint?: string,
): DetailFieldRow {
  return { key, label, value: displayValue(value), hint };
}

type BenefitTemplate = {
  fieldKey: string;
  label: string;
  applicationValue: string;
  question?: string;
  order: number;
};

function parseRequirementFieldKeys(
  verification: VerificationRecord | null | undefined,
): BenefitTemplate[] {
  const raw = verification?.verificationRequirement?.verificationFields;
  if (!Array.isArray(raw)) return [];
  const out: BenefitTemplate[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const o = item as Record<string, unknown>;
    const fieldKey = String(o.field ?? "").trim();
    if (!fieldKey) return;
    out.push({
      fieldKey,
      label: humanizeVerificationFieldKey(fieldKey),
      applicationValue: "—",
      question: typeof o.question === "string" ? o.question : undefined,
      order:
        typeof o.order === "number" && Number.isFinite(o.order)
          ? o.order
          : index + 1,
    });
  });
  return out;
}

function parseBenefitTemplates(
  doc: Record<string, unknown>,
  verification?: VerificationRecord | null,
): BenefitTemplate[] {
  const out: BenefitTemplate[] = [];
  const seen = new Set<string>();

  const push = (entry: BenefitTemplate) => {
    if (seen.has(entry.fieldKey)) return;
    seen.add(entry.fieldKey);
    out.push(entry);
  };

  const verificationFields = doc.verificationFields;
  if (Array.isArray(verificationFields)) {
    verificationFields.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const o = item as Record<string, unknown>;
      const fieldKey = String(o.field ?? "").trim();
      if (!fieldKey) return;
      push({
        fieldKey,
        label: humanizeVerificationFieldKey(fieldKey),
        applicationValue: "—",
        question: typeof o.question === "string" ? o.question : undefined,
        order:
          typeof o.order === "number" && Number.isFinite(o.order)
            ? o.order
            : index + 1,
      });
    });
  }

  const benefitsInfo = asRecord(doc.benefitsInfo);
  if (benefitsInfo) {
    let order = out.length + 1;
    for (const [key, value] of Object.entries(benefitsInfo)) {
      if (key === "history" && Array.isArray(value)) {
        for (const item of value) {
          if (!item || typeof item !== "object") continue;
          const h = item as Record<string, unknown>;
          const procedureCode = String(
            h.procedureCode ?? h.procedurecode ?? "",
          ).trim();
          const fieldKey = procedureCode
            ? `history.${procedureCode}`
            : `history.${order}`;
          const description = String(h.description ?? "").trim();
          push({
            fieldKey,
            label: description
              ? `${description}${procedureCode ? ` (${procedureCode})` : ""}`
              : humanizeVerificationFieldKey(fieldKey),
            applicationValue: displayValue(h.answer),
            question:
              typeof h.question === "string" ? h.question : undefined,
            order: order++,
          });
        }
        continue;
      }

      const benefit = asRecord(value);
      if (benefit && "question" in benefit) {
        push({
          fieldKey: key,
          label: humanizeVerificationFieldKey(key),
          applicationValue: displayValue(benefit.answer),
          question:
            typeof benefit.question === "string"
              ? benefit.question
              : undefined,
          order: order++,
        });
      }
    }
  }

  const skipKeys = new Set([
    "_id",
    "id",
    "patient",
    "provider",
    "office",
    "subscriber",
    "insurance",
    "eva",
    "benefitsInfo",
    "verificationFields",
    "payee",
    "payeeId",
    "patientId",
    "providerId",
    "officeId",
    "savedAt",
    "createdAt",
    "updatedAt",
    "source",
    "history",
  ]);

  for (const [key, value] of Object.entries(doc)) {
    if (skipKeys.has(key)) continue;
    const benefit = asRecord(value);
    if (benefit && "question" in benefit) {
      push({
        fieldKey: key,
        label: humanizeVerificationFieldKey(key),
        applicationValue: displayValue(benefit.answer),
        question:
          typeof benefit.question === "string" ? benefit.question : undefined,
        order: out.length + 1,
      });
    }
  }

  if (out.length === 0 && verification) {
    for (const entry of parseRequirementFieldKeys(verification)) {
      push(entry);
    }
  }

  return out.sort((a, b) => a.order - b.order || a.fieldKey.localeCompare(b.fieldKey));
}

/** Categorized read-only fields sourced from the Mongo appointment / application payload. */
export function getApplicationDetailSections(
  appointment: AppointmentRecord | Record<string, unknown>,
): DetailSection[] {
  const doc = appointment as Record<string, unknown>;
  const patient = asRecord(doc.patient);
  const subscriber = asRecord(doc.subscriber);
  const insurance = asRecord(doc.insurance);
  const providerDto = asRecord(doc.provider);
  const officeDto = asRecord(doc.office);

  const appt = appointment as AppointmentRecord;
  const payee = appt.payee;
  const provider = appt.provider;
  const office = appt.office;

  const patientNameFromDto = String(patient?.patientName ?? "").trim();
  const patientFirst =
    payee?.firstName?.trim() ||
    patientNameFromDto.split(/\s+/)[0] ||
    String(doc.Patient_FirstName ?? "").trim();
  const patientLast =
    payee?.lastName?.trim() ||
    patientNameFromDto.split(/\s+/).slice(1).join(" ") ||
    String(doc.Patient_LastName ?? "").trim();

  const officeAddress = office
    ? [
        office.address,
        [office.city, office.state].filter(Boolean).join(", "),
        office.zip,
      ]
        .filter(Boolean)
        .join(", ")
    : [
        officeDto?.address,
        [officeDto?.city, officeDto?.state].filter(Boolean).join(", "),
        officeDto?.zip ?? officeDto?.zipCode,
      ]
        .filter(Boolean)
        .join(", ");

  const payerPhone = [
    doc.InsuranceCompany_Phone_Ext,
    doc.InsuranceCompany_Phone,
  ]
    .map((v) => (v != null ? String(v).trim() : ""))
    .filter(Boolean)
    .join(" ");

  const sections: DetailSection[] = [
    {
      id: "patient",
      title: "Patient",
      subtitle: "Demographics and member identifiers from the application.",
      fields: [
        field("patientId", "Patient ID", patient?.patientId ?? appt.patientId),
        field("memberId", "Member ID", patient?.memberId),
        field("firstName", "First name", patientFirst),
        field("lastName", "Last name", patientLast),
        field(
          "dob",
          "Date of birth",
          formatDateOnly(patient?.patientDOB ?? payee?.dob ?? doc.Patient_DOB),
        ),
        field(
          "ssn",
          "SSN (on file)",
          payee?.ssn ? "On file" : doc.SSN ? "On file" : "—",
        ),
      ],
    },
    {
      id: "subscriber-insurance",
      title: "Subscriber & insurance plan",
      subtitle: "Coverage and subscriber data submitted with the appointment.",
      fields: [
        field(
          "subscriberId",
          "Subscriber ID",
          subscriber?.subscriberId ?? doc.SubscriberID,
        ),
        field(
          "subscriberName",
          "Subscriber name",
          subscriber?.subscriberName ??
            [doc.Insured_FirstName, doc.Insured_LastName]
              .filter(Boolean)
              .join(" "),
        ),
        field(
          "subscriberDob",
          "Subscriber DOB",
          formatDateOnly(subscriber?.subscriberDOB ?? doc.Insured_DOB),
        ),
        field(
          "insuranceCompany",
          "Insurance company",
          insurance?.companyName ?? doc.InsuranceCompany_Name,
        ),
        field(
          "insuredName",
          "Insured name",
          insurance?.insuredName ??
            [doc.Insured_FirstName, doc.Insured_LastName]
              .filter(Boolean)
              .join(" "),
        ),
        field(
          "groupNumber",
          "Group number",
          insurance?.groupNumber ??
            doc.Insurance_GroupNumber ??
            doc.InsurancePlan_GroupName,
        ),
        field(
          "groupName",
          "Group name",
          doc.Insurance_GroupName ?? doc.InsurancePlan_GroupName,
        ),
        field("payerPhone", "Payer phone (verification)", payerPhone || "—"),
      ],
    },
    {
      id: "visit-provider",
      title: "Visit & provider",
      subtitle: "Schedule, location, and treating provider from the application.",
      fields: [
        field(
          "appointmentId",
          "Appointment ID",
          doc.appointmentId ?? appt.appointmentId,
        ),
        field(
          "appointmentWhen",
          "Appointment date & time",
          formatDateTime(appt.date ?? doc.appointmentDate),
        ),
        field(
          "eligibility",
          "Eligibility result",
          doc.eligibilityResult ?? appt.reason,
        ),
        field("status", "Application status", doc.status ?? appt.status),
        field(
          "providerName",
          "Provider",
          providerDto?.providerName ??
            [provider?.firstName, provider?.lastName].filter(Boolean).join(" ") ??
            provider?.name,
        ),
        field(
          "providerId",
          "Provider ID",
          providerDto?.providerId ?? provider?.id,
        ),
        field(
          "providerTaxId",
          "Provider tax ID",
          providerDto?.providerTaxId ?? doc.TaxID,
        ),
        field("providerNpi", "NPI", provider?.npi ?? doc.Provider_NPI),
        field(
          "officeName",
          "Office",
          office?.name ?? officeDto?.name ?? doc.OfficeName,
        ),
        field("officeAddress", "Office address", officeAddress || "—"),
        field(
          "notes",
          "Appointment notes",
          appt.notes ?? doc.AppointmentNote ?? doc.notes,
        ),
      ],
    },
    {
      id: "application-meta",
      title: "Application metadata",
      subtitle: "Source system fields bundled with this appointment record.",
      fields: [
        field("tenantName", "Tenant", doc.tenantName),
        field("userName", "User", doc.userName),
        field("source", "Source", doc.source),
        field(
          "savedAt",
          "Saved at",
          formatDateTime(doc.savedAt ?? appt.savedAt ?? appt.createdAt),
        ),
      ],
    },
  ];

  const alwaysShow = new Set([
    "patient",
    "subscriber-insurance",
    "visit-provider",
  ]);
  return sections.filter(
    (s) =>
      alwaysShow.has(s.id) ||
      s.fields.some((f) => f.value !== "—"),
  );
}

function mergedExtractedData(
  appointment: AppointmentRecord | Record<string, unknown>,
  verification: VerificationRecord | null | undefined,
): Record<string, string | null> {
  const doc = appointment as Record<string, unknown>;
  const eva = asRecord(doc.eva);
  const fromEva = asRecord(eva?.extractedData);
  const fromVerification =
    verification?.extractedData &&
    typeof verification.extractedData === "object" &&
    !Array.isArray(verification.extractedData)
      ? verification.extractedData
      : {};

  return {
    ...(fromEva as Record<string, string | null> | undefined),
    ...fromVerification,
  };
}

function buildCallExtractionRows(
  appointment: AppointmentRecord | Record<string, unknown>,
  verification: VerificationRecord | null | undefined,
): CallExtractionRow[] {
  const doc = appointment as Record<string, unknown>;
  const data = mergedExtractedData(appointment, verification);
  const templates = parseBenefitTemplates(doc, verification);

  const rows: CallExtractionRow[] = [];

  const pushRow = (row: Omit<CallExtractionRow, "category" | "filled"> & {
    extractedValue: string;
  }) => {
    const extractedValue = row.extractedValue.trim();
    rows.push(
      toCallExtractionRow({
        ...row,
        extractedValue,
        filled: extractedValue !== "",
      }),
    );
  };

  if (templates.length > 0) {
    for (const t of templates) {
      const raw = data[t.fieldKey];
      pushRow({
        fieldKey: t.fieldKey,
        label: t.label,
        extractedValue:
          raw != null && String(raw).trim() !== "" ? String(raw) : "",
        questionHint: t.question,
      });
    }
  } else if (verification) {
    for (const t of parseRequirementFieldKeys(verification)) {
      const raw = data[t.fieldKey];
      pushRow({
        fieldKey: t.fieldKey,
        label: t.label,
        extractedValue:
          raw != null && String(raw).trim() !== "" ? String(raw) : "",
        questionHint: t.question,
      });
    }
  }

  const usedKeys = new Set(rows.map((r) => r.fieldKey));
  for (const [fieldKey, raw] of Object.entries(data)) {
    if (fieldKey === "transcript" || usedKeys.has(fieldKey)) continue;
    pushRow({
      fieldKey,
      label: humanizeVerificationFieldKey(fieldKey),
      extractedValue:
        raw != null && String(raw).trim() !== "" ? String(raw) : "",
    });
  }

  if (rows.length === 0 && verification) {
    const legacy: { key: string; label: string; value?: string }[] = [
      { key: "coverage", label: "Coverage", value: verification.coverage },
      { key: "deductible", label: "Deductible", value: verification.deductible },
      { key: "copay", label: "Copay", value: verification.copay },
      { key: "validity", label: "Validity", value: verification.validity },
    ];
    for (const item of legacy) {
      const extractedValue =
        item.value != null && String(item.value).trim() !== ""
          ? String(item.value)
          : "";
      if (!extractedValue) continue;
      rows.push(
        toCallExtractionRow({
          fieldKey: item.key,
          label: item.label,
          extractedValue,
          filled: true,
        }),
      );
    }
  }

  return rows;
}

/** Rows for values captured during the EVA call, aligned to configured field keys. */
export function getCallExtractionRows(
  appointment: AppointmentRecord | Record<string, unknown>,
  verification: VerificationRecord | null | undefined,
): CallExtractionRow[] {
  return buildCallExtractionRows(appointment, verification);
}

export function getCallExtractionGroups(
  appointment: AppointmentRecord | Record<string, unknown>,
  verification: VerificationRecord | null | undefined,
): CallExtractionGroup[] {
  const rows = buildCallExtractionRows(appointment, verification);
  const mandatory = rows.filter((r) => r.category === "mandatory");
  const benefit = rows.filter((r) => r.category === "benefit");
  const history = rows.filter((r) => r.category === "history");

  const groups: CallExtractionGroup[] = [];

  if (mandatory.length > 0) {
    groups.push({
      id: "mandatory",
      title: "Mandatory fields",
      subtitle: "Plan and membership details collected before benefit amounts.",
      rows: mandatory,
    });
  }

  if (benefit.length > 0) {
    groups.push({
      id: "benefits",
      title: "Benefit fields",
      subtitle: "Coverage amounts, deductibles, maximums, and related benefits.",
      rows: benefit,
    });
  }

  if (history.length > 0) {
    groups.push({
      id: "history",
      title: "History",
      subtitle: "Procedure history codes captured on the call.",
      rows: history,
    });
  }

  return groups;
}

export function countFilledCallExtractions(rows: CallExtractionRow[]): {
  filled: number;
  total: number;
} {
  return {
    filled: rows.filter((r) => r.filled).length,
    total: rows.length,
  };
}

export function callExtractionRowsToDraft(
  rows: CallExtractionRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.fieldKey] = row.extractedValue;
  }
  return out;
}

export function applyDraftToCallExtractionRows(
  rows: CallExtractionRow[],
  draft: Record<string, string>,
): CallExtractionRow[] {
  return rows.map((row) => {
    const value = draft[row.fieldKey] ?? row.extractedValue ?? "";
    const trimmed = value.trim();
    return {
      ...row,
      extractedValue: value,
      filled: trimmed !== "",
    };
  });
}
