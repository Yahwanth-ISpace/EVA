import type { VerificationRecord } from "../redux/types/verificationTypes";

type FieldEntry = {
  field: string;
  required?: boolean;
  order?: number;
  question?: string;
};

function parseRequirementFields(raw: unknown): FieldEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.field !== "string") continue;
    out.push({
      field: o.field,
      required: typeof o.required === "boolean" ? o.required : undefined,
      order: typeof o.order === "number" ? o.order : undefined,
      question: typeof o.question === "string" ? o.question : undefined,
    });
  }
  return out.sort(
    (a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.field.localeCompare(b.field),
  );
}

export function humanizeVerificationFieldKey(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

export type VerificationFieldRow = {
  key: string;
  label: string;
  value: string;
  questionHint?: string;
};

/**
 * Rows to show in the UI: order/labels from VerificationRequirement when present,
 * else keys from extractedData, else legacy flat coverage/deductible/copay/validity.
 */
export function getVerificationFieldRows(
  verification: VerificationRecord | null | undefined,
): VerificationFieldRow[] {
  if (!verification) return [];

  const data =
    verification.extractedData &&
    typeof verification.extractedData === "object" &&
    !Array.isArray(verification.extractedData)
      ? (verification.extractedData as Record<string, string | null>)
      : {};

  const reqFields = parseRequirementFields(
    verification.verificationRequirement?.verificationFields,
  );

  if (reqFields.length > 0) {
    return reqFields.map((e) => {
      const v = data[e.field];
      return {
        key: e.field,
        label: humanizeVerificationFieldKey(e.field),
        value: v != null && String(v).trim() !== "" ? String(v) : "",
        questionHint: e.question,
      };
    });
  }

  const keys = Object.keys(data).filter((k) => k !== "transcript");
  if (keys.length > 0) {
    return keys.sort().map((k) => {
      const v = data[k];
      return {
        key: k,
        label: humanizeVerificationFieldKey(k),
        value: v != null && String(v).trim() !== "" ? String(v) : "",
      };
    });
  }

  const legacy: { key: string; label: string; value: string | undefined }[] = [
    { key: "coverage", label: "Coverage", value: verification.coverage },
    { key: "deductible", label: "Deductible", value: verification.deductible },
    { key: "copay", label: "Copay", value: verification.copay },
    { key: "validity", label: "Validity", value: verification.validity },
  ];
  return legacy
    .filter((x) => x.value != null && String(x.value).trim() !== "")
    .map(({ key, label, value }) => ({
      key,
      label,
      value: String(value),
    }));
}

/**
 * Prefer verification rows linked to this appointment.
 * Legacy rows without `appointmentId` are only reused when this payee has a single appointment
 * (otherwise the same row would incorrectly appear on every visit).
 */
export function getVerificationForAppointment(
  verifications: VerificationRecord[],
  appointmentId: string,
  payeeId: string,
  samePayeeAppointmentCount?: number,
): VerificationRecord | undefined {
  const linked = verifications.find((v) => v.appointmentId === appointmentId);
  if (linked) return linked;
  if (samePayeeAppointmentCount !== 1) return undefined;
  const unlinked = verifications.filter(
    (v) =>
      v.payee?.id === payeeId &&
      (v.appointmentId == null || v.appointmentId === ""),
  );
  if (unlinked.length === 1) return unlinked[0];
  return undefined;
}
