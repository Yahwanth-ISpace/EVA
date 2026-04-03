import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import {
  deleteAppointment,
  getAppointments,
} from "../redux/actions/appointmentsActions";
import type { AppDispatch, RootState } from "../redux/store";
import type { AppointmentRecord } from "../redux/types/appointmentsTypes";
import { FaSearch, FaTrashAlt } from "react-icons/fa";
import { api } from "../utils/api";
import {
  isCallActiveFromTrackers,
} from "../utils/botTracker";
import type { BotTrackerRecord } from "../utils/botTracker";
import { getVerificationForAppointment } from "../utils/verificationDisplay";

const SKELETON_ROW_COUNT = 8;

const SkeletonTable = () => (
  <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-3">
              Patient
            </th>
            <th scope="col" className="px-4 py-3">
              Provider
            </th>
            <th scope="col" className="px-4 py-3">
              Office
            </th>
            <th scope="col" className="px-4 py-3 whitespace-nowrap">
              Date
            </th>
            <th scope="col" className="px-4 py-3 whitespace-nowrap">
              Status
            </th>
            <th scope="col" className="px-3 py-3 w-14 text-center">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 animate-pulse">
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, idx) => (
            <tr key={idx} aria-hidden>
              <td className="px-4 py-3 align-middle max-w-[200px]">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded-md w-[min(100%,11rem)]" />
                  <div className="h-4 bg-slate-200 rounded-md w-[min(100%,8rem)]" />
                </div>
              </td>
              <td className="px-4 py-3 align-middle max-w-[180px]">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded-md w-[min(100%,10rem)]" />
                  <div className="h-4 bg-slate-200 rounded-md w-[min(100%,6.5rem)]" />
                </div>
              </td>
              <td className="px-4 py-3 align-middle max-w-[200px]">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded-md w-[min(100%,12rem)]" />
                  <div className="h-4 bg-slate-200 rounded-md w-[min(100%,7rem)]" />
                </div>
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <div className="h-4 bg-slate-200 rounded-md w-[7.25rem]" />
              </td>
              <td className="px-4 py-3 align-middle whitespace-nowrap">
                <div className="inline-flex h-[1.625rem] min-w-[5.5rem] bg-slate-200 rounded-full" />
              </td>
              <td className="px-2 py-2 text-center align-middle w-14">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 mx-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

function statusBadgeClasses(isVerified: boolean, isCallInProgress: boolean) {
  if (isVerified)
    return "bg-emerald-50 text-emerald-700 border border-emerald-100";
  if (isCallInProgress)
    return "bg-amber-50 text-amber-700 border border-amber-100";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function statusDotClass(isVerified: boolean, isCallInProgress: boolean) {
  if (isVerified) return "bg-emerald-500";
  if (isCallInProgress) return "bg-amber-500";
  return "bg-slate-500";
}

function statusLabel(isVerified: boolean, isCallInProgress: boolean) {
  if (isVerified) return "Verified";
  if (isCallInProgress) return "In progress";
  return "Scheduled";
}

type SortBy =
  | "date_desc"
  | "date_asc"
  | "patient_asc"
  | "provider_asc"
  | "status_asc";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");

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

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = (appt: AppointmentRecord) => {
      if (!q) return true;
      const patientName =
        `${appt.payee.firstName} ${appt.payee.lastName}`.toLowerCase();
      const providerName =
        `${appt.provider.firstName} ${appt.provider.lastName}`.toLowerCase();
      const officeHaystack = [
        appt.office.name,
        appt.office.city,
        appt.office.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        patientName.includes(q) ||
        providerName.includes(q) ||
        officeHaystack.includes(q)
      );
    };

    const statusRank = (appt: AppointmentRecord) => {
      const samePayeeCount = appointments.filter(
        (a) => a.payeeId === appt.payeeId,
      ).length;
      const verification = getVerificationForAppointment(
        verifications,
        appt.id,
        appt.payeeId,
        samePayeeCount,
      );
      if (Boolean(verification)) return 2;
      if (
        isCallActiveFromTrackers(
          liveTrackersByPayee[appt.payeeId] ?? [],
        )
      )
        return 1;
      return 0;
    };

    const list = appointments.filter(matchesSearch);

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return (
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
        case "date_asc":
          return (
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
        case "patient_asc": {
          const na =
            `${a.payee.firstName} ${a.payee.lastName}`.toLowerCase();
          const nb =
            `${b.payee.firstName} ${b.payee.lastName}`.toLowerCase();
          const c = na.localeCompare(nb);
          if (c !== 0) return c;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        case "provider_asc": {
          const na =
            `${a.provider.firstName} ${a.provider.lastName}`.toLowerCase();
          const nb =
            `${b.provider.firstName} ${b.provider.lastName}`.toLowerCase();
          const c = na.localeCompare(nb);
          if (c !== 0) return c;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        case "status_asc": {
          const ra = statusRank(a);
          const rb = statusRank(b);
          if (ra !== rb) return ra - rb;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        default:
          return 0;
      }
    });
  }, [
    appointments,
    verifications,
    liveTrackersByPayee,
    searchQuery,
    sortBy,
  ]);

  return (
    <div className="flex flex-col relative flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
          Appointments
        </h2>
        {!loading && appointments.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            <label htmlFor="appointments-search" className="sr-only">
              Search appointments
            </label>
            <div className="relative flex-1 min-w-[180px] max-w-xs sm:flex-initial sm:min-w-[220px]">
              <FaSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
                aria-hidden
              />
              <input
                id="appointments-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, provider, office…"
                autoComplete="off"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <label htmlFor="appointments-sort" className="sr-only">
              Sort appointments by
            </label>
            <select
              id="appointments-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="date_desc">Date (newest first)</option>
              <option value="date_asc">Date (oldest first)</option>
              <option value="patient_asc">Patient (A–Z)</option>
              <option value="provider_asc">Provider (A–Z)</option>
              <option value="status_asc">Status (scheduled first)</option>
            </select>
          </div>
        ) : null}
      </div>
      <div className="shrink-0 h-px bg-slate-200 my-4" role="presentation" />
      <div className="content-wrapper flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
        {loading ? (
          <SkeletonTable />
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-slate-500 text-center text-sm">
              No appointments yet.
            </p>
            <p className="text-slate-400 text-center text-xs mt-1">
              New appointments will appear here.
            </p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-slate-500 text-center text-sm">
              No appointments match your search.
            </p>
            <p className="text-slate-400 text-center text-xs mt-1">
              Try a different search term.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-4 py-3">
                      Patient
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Provider
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Office
                    </th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-3 whitespace-nowrap">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3 w-14 text-center">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAppointments.map((appt: AppointmentRecord) => {
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
                    const patientName = `${appt.payee.firstName} ${appt.payee.lastName}`;
                    const providerName = `${appt.provider.firstName} ${appt.provider.lastName}`;
                    const officeLine = [appt.office.name, appt.office.city]
                      .filter(Boolean)
                      .join(", ");
                    const dateStr = new Date(appt.date).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    );
                    return (
                      <tr
                        key={appt.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => handleOpenDetails(appt.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleOpenDetails(appt.id);
                          }
                        }}
                        className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px]">
                          <span className="line-clamp-2">{patientName}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[180px]">
                          <span className="line-clamp-2">{providerName}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[200px]">
                          <span className="line-clamp-2">{officeLine}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {dateStr}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusBadgeClasses(isVerified, isCallInProgress)}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(isVerified, isCallInProgress)}`}
                            />
                            {statusLabel(isVerified, isCallInProgress)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(
                                  "Are you sure you want to delete this appointment?",
                                )
                              ) {
                                handleDelete(appt.id);
                              }
                            }}
                            className="inline-flex p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200"
                            aria-label="Delete appointment"
                          >
                            <FaTrashAlt className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
