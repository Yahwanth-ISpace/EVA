import type { AppointmentRecord } from "../redux/types/appointmentsTypes";
import type { BotTrackerRecord } from "./botTracker";
import { isCallActiveFromTrackers } from "./botTracker";

export type ActiveLiveCall = {
  callSid: string;
  patientId: string;
  appointmentId: string | null;
};

/** Patient / payee key used for bot-tracker polling (same as Twilio stream `patientId`). */
export function resolveAppointmentPayeeId(
  appt: AppointmentRecord | Record<string, unknown> | null | undefined,
): string | undefined {
  if (!appt) return undefined;
  const payeeId = (appt as AppointmentRecord).payeeId;
  if (payeeId?.trim()) return payeeId.trim();
  const patient = (appt as Record<string, unknown>).patient as
    | Record<string, unknown>
    | undefined;
  const fromPatient = patient?.patientId;
  if (fromPatient != null && String(fromPatient).trim()) {
    return String(fromPatient).trim();
  }
  const legacy = (appt as Record<string, unknown>).PatientID;
  if (legacy != null && String(legacy).trim()) return String(legacy).trim();
  return undefined;
}

export function resolveAppointmentNumericId(
  appt: AppointmentRecord | Record<string, unknown>,
): string | undefined {
  const raw =
    (appt as Record<string, unknown>).appointmentId ??
    (appt as AppointmentRecord & { appointmentId?: string | number })
      .appointmentId;
  if (raw == null || String(raw).trim() === "") return undefined;
  return String(raw).trim();
}

export function resolveAppointmentRouteId(
  appt: AppointmentRecord | Record<string, unknown>,
): string {
  const id = (appt as AppointmentRecord).id;
  if (id?.trim()) return id.trim();
  const oid = (appt as Record<string, unknown>)._id;
  if (oid != null) {
    if (typeof oid === "object" && oid !== null && "$oid" in oid) {
      return String((oid as { $oid: string }).$oid);
    }
    return String(oid);
  }
  const numeric = resolveAppointmentNumericId(appt);
  if (numeric) return numeric;
  return "";
}

export function isAppointmentLive(
  appt: AppointmentRecord,
  activeCalls: ActiveLiveCall[],
  trackersByPayee: Record<string, BotTrackerRecord[]>,
): boolean {
  const numericId = resolveAppointmentNumericId(appt);
  if (
    numericId &&
    activeCalls.some((c) => c.appointmentId === numericId)
  ) {
    return true;
  }
  const payeeId = resolveAppointmentPayeeId(appt);
  if (
    payeeId &&
    isCallActiveFromTrackers(trackersByPayee[payeeId] ?? [])
  ) {
    return true;
  }
  return false;
}
