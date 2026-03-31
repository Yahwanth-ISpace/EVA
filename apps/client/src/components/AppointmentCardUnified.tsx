import { FaUserMd, FaCalendarAlt, FaTrashAlt } from "react-icons/fa";
import type { AppointmentRecord } from "../redux/types/appointmentsTypes";

interface Props {
  appt: AppointmentRecord;
  isVerified: boolean;
  isCallInProgress?: boolean;
  onOpenDetails: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function AppointmentCardUnified({
  appt,
  isVerified,
  isCallInProgress = false,
  onOpenDetails,
  onDelete,
}: Props) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this appointment?")) {
      onDelete(appt.id);
    }
  };

  const statusLabel = isVerified
    ? "Verified"
    : isCallInProgress
      ? "In progress"
      : "Scheduled";

  const statusClass = isVerified
    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
    : isCallInProgress
      ? "bg-amber-50 text-amber-700 border border-amber-100"
      : "bg-slate-100 text-slate-700 border border-slate-200";

  const dotClass = isVerified
    ? "bg-emerald-500"
    : isCallInProgress
      ? "bg-amber-500"
      : "bg-slate-500";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(appt.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpenDetails(appt.id)}
      className="group relative h-full w-full max-w-sm rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:border-slate-200 hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.08),0_2px_4px_-2px_rgba(0,0,0,0.06)] transition-all duration-200 text-left cursor-pointer min-h-[160px] flex flex-col"
    >
      {/* Pill with dot inside - top right, inset from edge */}
      <div className="absolute top-4 right-6 z-10">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm ${statusClass}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
          {statusLabel}
        </span>
      </div>

      {/* Card body */}
      <div className="p-5 pt-10 flex-1">
        <div className="min-w-0 pr-8">
          <h2 className="mt-3 text-xl tracking-widest font-semibold text-slate-800 truncate group-hover:text-slate-900">
            {appt.payee.firstName} {appt.payee.lastName}
          </h2>
          <div className="mt-3 space-y-2 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <FaUserMd className="text-slate-400 shrink-0 w-4" />
              <span className="truncate">
                {appt.provider.firstName} {appt.provider.lastName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FaCalendarAlt className="text-slate-400 shrink-0 w-4" />
              <span>
                {new Date(appt.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete icon - bottom right */}
      <div className="absolute bottom-4 right-4 z-10">
        <button
          type="button"
          onClick={handleDelete}
          className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200"
          aria-label="Delete appointment"
        >
          <FaTrashAlt className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
