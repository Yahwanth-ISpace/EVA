import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import {
  deleteAppointment,
  getAppointments,
} from "../redux/actions/appointmentsActions";
import type { AppDispatch, RootState } from "../redux/store";
import type { AppointmentRecord } from "../redux/types/appointmentsTypes";
import AppointmentCardUnified from "./AppointmentCardUnified";
import { api } from "../utils/api";
import {
  isCallActiveFromTrackers,
} from "../utils/botTracker";
import type { BotTrackerRecord } from "../utils/botTracker";
import { getVerificationForAppointment } from "../utils/verificationDisplay";

const SkeletonCard = () => (
  <div className="w-full max-w-sm rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 animate-pulse min-h-[160px] flex flex-col relative shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_-1px_rgba(0,0,0,0.06)]">
    <div className="absolute top-4 right-4 w-24 h-6 bg-slate-200 rounded-full" />
    <div className="p-5 pt-10 flex-1">
      <div className="mt-3 h-6 bg-slate-200 rounded-md w-4/5" />
      <div className="mt-3 space-y-2">
        <div className="h-4 bg-slate-200 rounded w-1/2" />
        <div className="h-4 bg-slate-200 rounded w-2/3" />
      </div>
    </div>
    <div className="absolute bottom-4 right-4 w-9 h-9 bg-slate-200 rounded-lg" />
  </div>
);

export default function PatientTabs() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { appointments, loading: loadingAppointments } = useSelector(
    (state: RootState) => state.appointmentsState,
  );
  const { verifications, loading: loadingVerifications } = useSelector(
    (state: RootState) => state.verificationsState,
  );

  const loading = loadingAppointments || loadingVerifications;
  const [liveTrackersByPayee, setLiveTrackersByPayee] = useState<
    Record<string, BotTrackerRecord[]>
  >({});

  const payeeIds = useMemo(
    () => Array.from(new Set(appointments.map((a) => a.payeeId).filter(Boolean))),
    [appointments],
  );

  useEffect(() => {
    if (!payeeIds.length) {
      setLiveTrackersByPayee({});
      return;
    }

    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const pairs = await Promise.all(
          payeeIds.map(async (payeeId) => {
            const logs = await api.get<BotTrackerRecord[]>(
              `/bot-trackers/payee/${payeeId}`,
            );
            return [payeeId, logs] as const;
          }),
        );
        if (cancelled) return;
        const next: Record<string, BotTrackerRecord[]> = {};
        for (const [payeeId, logs] of pairs) next[payeeId] = logs;
        setLiveTrackersByPayee(next);
      } catch {
        // Keep UI resilient even if bot tracker endpoint fails.
      }
    };

    fetchLogs();
    const timer = window.setInterval(fetchLogs, 7000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [payeeIds]);

  const handleOpenDetails = (appointmentId: string) => {
    navigate(`/appointments/${appointmentId}`);
  };

  const handleDelete = (appointmentId: string) => {
    dispatch(deleteAppointment(appointmentId));
    dispatch(getAppointments());
  };

  return (
    <div className="flex flex-col relative flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
          Appointments
        </h2>
      </div>
      <div className="shrink-0 h-px bg-slate-200 my-4" role="presentation" />
      <div className="content-wrapper flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
        {loading ? (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full">
            {Array.from({ length: 6 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-slate-500 text-center text-sm">
              No appointments yet.
            </p>
            <p className="text-slate-400 text-center text-xs mt-1">
              New appointments will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full">
            {appointments.map((appt: AppointmentRecord) => {
              const samePayeeCount = appointments.filter(
                (a) => a.payeeId === appt.payeeId,
              ).length;
              const verification = getVerificationForAppointment(
                verifications,
                appt.id,
                appt.payeeId,
                samePayeeCount,
              );
              const isVerified = Boolean(verification);
              const isCallInProgress = isCallActiveFromTrackers(
                liveTrackersByPayee[appt.payeeId] ?? [],
              );
              return (
                <AppointmentCardUnified
                  key={appt.id}
                  appt={appt}
                  isVerified={isVerified}
                  isCallInProgress={isCallInProgress}
                  onOpenDetails={handleOpenDetails}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
