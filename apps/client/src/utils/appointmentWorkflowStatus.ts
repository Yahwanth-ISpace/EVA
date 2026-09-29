import type { BotTrackerRecord } from "./botTracker";
import { payeeHasCallActivity } from "./botTracker";
import type { VerificationRecord } from "../redux/types/verificationTypes";
import { isVerificationComplete } from "./verificationDisplay";

export type AppointmentWorkflowStatus =
  | "Scheduled"
  | "In progress"
  | "Incomplete"
  | "Complete";

export function resolveAppointmentWorkflowStatus(
  isCallInProgress: boolean,
  verification: VerificationRecord | undefined,
  trackers: BotTrackerRecord[],
): AppointmentWorkflowStatus {
  if (isCallInProgress) return "In progress";
  if (verification && isVerificationComplete(verification)) return "Complete";
  if (
    verification ||
    (!isCallInProgress && payeeHasCallActivity(trackers))
  ) {
    return "Incomplete";
  }
  return "Scheduled";
}

export function workflowStatusBadgeClasses(
  status: AppointmentWorkflowStatus,
): string {
  switch (status) {
    case "Complete":
      return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    case "In progress":
      return "bg-amber-50 text-amber-700 border border-amber-100";
    case "Incomplete":
      return "bg-orange-50 text-orange-800 border border-orange-100";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

export function workflowStatusDotClass(
  status: AppointmentWorkflowStatus,
): string {
  switch (status) {
    case "Complete":
      return "bg-emerald-500";
    case "In progress":
      return "bg-amber-500";
    case "Incomplete":
      return "bg-orange-500";
    default:
      return "bg-slate-500";
  }
}

export function workflowStatusSortRank(
  status: AppointmentWorkflowStatus,
): number {
  switch (status) {
    case "Scheduled":
      return 0;
    case "In progress":
      return 1;
    case "Incomplete":
      return 2;
    case "Complete":
      return 3;
    default:
      return 0;
  }
}
