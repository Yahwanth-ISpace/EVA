import {
  useParams,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppDispatch, RootState } from "../redux/store";
import Navbar from "../components/Navbar";
import type { AppointmentRecord } from "../redux/types/appointmentsTypes";
import Icon from "../components/Icons";
import { api } from "../utils/api";
import {
  extractActiveCallSidFromTrackers,
  hasSupervisorBargeSinceLatestCallStart,
  hasTpaAngrySinceLatestCallStart,
  isCallActiveFromTrackers,
} from "../utils/botTracker";
import { CallActivitySection } from "../components/CallActivitySection";
import {
  resolveAppointmentNumericId,
  resolveAppointmentPayeeId,
} from "../utils/appointmentRecord";
import {
  buildTranscriptLogFromTrackers,
} from "../utils/botTracker";
import { useLiveBotTrackers } from "../utils/useLiveBotTrackers";
import {
  resolveAppointmentWorkflowStatus,
  workflowStatusBadgeClasses,
  workflowStatusDotClass,
} from "../utils/appointmentWorkflowStatus";
import { getVerificationForAppointment } from "../utils/verificationDisplay";
import {
  applyDraftToCallExtractionRows,
  callExtractionRowsToDraft,
  countFilledCallExtractions,
  getApplicationDetailSections,
  getCallExtractionRows,
  type CallExtractionRow,
  type DetailFieldRow,
} from "../utils/appointmentDetailDisplay";
import { getVerifications } from "../redux/actions/verificationActions";

function maskSsn(ssn: string | undefined | null): string {
  if (!ssn?.trim()) return "—";
  const d = ssn.replace(/\D/g, "");
  if (d.length >= 4) return `•••-••-${d.slice(-4)}`;
  return "On file";
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/70 ${className}`}
      aria-hidden
    />
  );
}

function sectionHeading(title: string, subtitle: string): ReactNode {
  return (
    <div className="flex items-center gap-2 mb-4 sm:mb-5">
      <span className="flex h-8 w-1 rounded-full bg-indigo-600 shrink-0" />
      <div>
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          {title}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function DetailFieldGrid({
  fields,
  fieldClass,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  fields: DetailFieldRow[];
  fieldClass: string;
  columns?: string;
}) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {fields.map((row) => (
        <div key={row.key}>
          <label
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5"
            title={row.hint}
          >
            {row.label}
          </label>
          <p className={fieldClass} title={row.hint}>
            {row.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function CallExtractionField({
  row,
  fieldClass,
  editing,
  onValueChange,
}: {
  row: CallExtractionRow;
  fieldClass: string;
  editing?: boolean;
  onValueChange?: (fieldKey: string, value: string) => void;
}) {
  const title = [row.fieldKey, row.questionHint].filter(Boolean).join(" · ");
  const filled = row.extractedValue.trim() !== "";
  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <label
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-0"
          title={title}
          htmlFor={editing ? `extract-${row.fieldKey}` : undefined}
        >
          {row.label}
        </label>
        {!editing ? (
          <span
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
              filled
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80"
                : "bg-slate-100 text-slate-500 ring-1 ring-slate-200/80"
            }`}
          >
            {filled ? "Captured" : "Pending"}
          </span>
        ) : null}
      </div>
      {editing ? (
        <input
          id={`extract-${row.fieldKey}`}
          type="text"
          value={row.extractedValue}
          onChange={(e) => onValueChange?.(row.fieldKey, e.target.value)}
          className={`${fieldClass} focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100`}
          placeholder="—"
          title={title}
        />
      ) : (
        <p
          className={`${fieldClass} ${
            filled ? "border-emerald-200/90 bg-emerald-50/30" : ""
          }`}
          title={title}
        >
          {row.extractedValue || "—"}
        </p>
      )}
    </div>
  );
}

function CallExtractionFieldGrid({
  rows,
  fieldClass,
  editing,
  onValueChange,
}: {
  rows: CallExtractionRow[];
  fieldClass: string;
  editing?: boolean;
  onValueChange?: (fieldKey: string, value: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <CallExtractionField
          key={row.fieldKey}
          row={row}
          fieldClass={fieldClass}
          editing={editing}
          onValueChange={onValueChange}
        />
      ))}
    </div>
  );
}

function AppointmentDetailLoadingShell({
  navigate,
}: {
  navigate: NavigateFunction;
}) {
  return (
    <div className="flex flex-col h-screen max-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80 overflow-hidden pt-5">
      <Navbar />

      <div className="w-full flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8 py-6 mx-auto max-w-[min(1400px,100%)]">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="group text-sm uppercase text- font-medium tracking-widest text-slate-600 hover:text-indigo-700 flex items-center gap-2 w-fit transition-colors"
        >
          <Icon iconName="leftArrow" iconColor="currentColor" size="xs" />
          Back to dashboard
        </button>

        <div className="mt-4 relative flex-1 min-h-0 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden ring-1 ring-slate-900/5">
          <div className="absolute top-4 right-4 sm:top-6 z-10 md:right-[calc(min(440px,42vw)+1.25rem)]">
            <SkeletonBar className="h-7 w-28 rounded-full" />
          </div>

          <div className="flex-1 min-h-0 pr-1 overflow-hidden flex flex-col">
            <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row md:items-stretch">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                <section className="p-6 sm:p-8 pt-14 sm:pt-7 border-b border-slate-100 bg-slate-50/40">
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600/90 mb-7">
                    Appointment record
                  </p>
                  {sectionHeading(
                    "Patient",
                    "Demographics used for eligibility and verification.",
                  )}
                  <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-10">
                    <div className="shrink-0 flex justify-center lg:justify-start">
                      <SkeletonBar className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl" />
                    </div>
                    <div className="min-w-0 flex-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i}>
                          <SkeletonBar className="h-3 w-20 mb-2" />
                          <SkeletonBar className="h-10 w-full rounded-lg" />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="p-6 sm:p-8 border-b border-slate-100">
                  {sectionHeading(
                    "Visit & provider",
                    "When and where care is scheduled; who is treating the patient.",
                  )}
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <SkeletonBar className="h-3 w-24 mb-2" />
                      <SkeletonBar className="h-10 w-full rounded-lg" />
                    </div>
                    <div className="sm:col-span-2">
                      <SkeletonBar className="h-3 w-16 mb-2" />
                      <SkeletonBar className="h-10 w-full rounded-lg" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <SkeletonBar className="h-3 w-40 mb-2" />
                      <SkeletonBar className="h-10 w-full rounded-lg" />
                    </div>
                  </div>
                </section>

                <section className="p-6 sm:p-8 border-b border-slate-100">
                  {sectionHeading(
                    "Call extraction",
                    "Values captured on the verification call—mapped to application field keys.",
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 4 }, (_, i) => (
                      <div key={i}>
                        <SkeletonBar className="h-3 w-28 mb-2" />
                        <SkeletonBar className="h-10 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="flex flex-col min-h-[min(52vh,480px)] md:min-h-0 w-full md:w-[min(440px,42vw)] shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-slate-50/30 overflow-hidden">
                <section className="flex flex-col flex-1 min-h-0 p-4 sm:p-5 border-0 bg-slate-50/40">
                  {sectionHeading(
                    "Call activity",
                    "Live lines during the call; transcript after it ends.",
                  )}
                  <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
                    <div
                      className="flex flex-wrap items-stretch justify-start gap-0 border-b border-slate-200 bg-white px-2 pt-1 shrink-0"
                      role="tablist"
                      aria-label="Call activity"
                    >
                      <div className="relative px-4 py-3 text-sm font-semibold text-emerald-600 rounded-t-lg">
                        <span className="inline-flex items-center gap-2">
                          <span>Live</span>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.35)]"
                            aria-hidden
                          />
                        </span>
                        <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-emerald-500" />
                      </div>
                      <div className="relative px-4 py-3 text-sm font-semibold text-slate-500 rounded-t-lg">
                        Transcript
                      </div>
                    </div>
                    <div className="flex-1 min-h-[180px] p-4 space-y-3">
                      {Array.from({ length: 8 }, (_, i) => (
                        <SkeletonBar
                          key={i}
                          className={`h-3 rounded w-full ${
                            i % 3 === 1
                              ? "max-w-[88%]"
                              : i % 3 === 2
                                ? "max-w-[58%]"
                                : ""
                          }`}
                        />
                      ))}
                    </div>
                    <div className="p-3 border-t border-slate-200 shrink-0">
                      <SkeletonBar className="h-10 w-full rounded-lg" />
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { appointments } = useSelector(
    (state: RootState) => state.appointmentsState,
  );
  const { verifications, loading: loadingVerifications } = useSelector(
    (state: RootState) => state.verificationsState,
  );

  const appointmentFromStore = useMemo(() => {
    if (!id) return undefined;
    return appointments.find((a: AppointmentRecord) => {
      if (a.id === id) return true;
      if (String(a.appointmentId ?? "") === id) return true;
      return false;
    });
  }, [appointments, id]);

  const [fetchedAppointment, setFetchedAppointment] = useState<
    AppointmentRecord | null | undefined
  >(undefined);

  useEffect(() => {
    setFetchedAppointment(undefined);
  }, [id]);

  useEffect(() => {
    if (!id || appointmentFromStore) return;
    let cancelled = false;
    api
      .get<AppointmentRecord>(`/appointments/${id}`)
      .then((data) => {
        if (!cancelled) setFetchedAppointment(data);
      })
      .catch(() => {
        if (!cancelled) setFetchedAppointment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, appointmentFromStore]);

  useEffect(() => {
    if (verifications.length === 0) {
      dispatch(getVerifications());
    }
  }, [dispatch, verifications.length]);

  const remoteMatchesId =
    fetchedAppointment != null && fetchedAppointment.id === id;
  const appointment =
    appointmentFromStore ??
    (fetchedAppointment === null
      ? undefined
      : remoteMatchesId
        ? fetchedAppointment
        : undefined);

  const loadingAppointment = Boolean(
    id &&
    !appointmentFromStore &&
    (fetchedAppointment === undefined ||
      (fetchedAppointment !== null && fetchedAppointment.id !== id)),
  );

  const appointmentPayeeId = appointment
    ? resolveAppointmentPayeeId(appointment)
    : undefined;

  const samePayeeAppointmentCount = useMemo(
    () =>
      appointment && appointmentPayeeId
        ? appointments.filter(
            (a) => resolveAppointmentPayeeId(a) === appointmentPayeeId,
          ).length
        : 0,
    [appointments, appointment, appointmentPayeeId],
  );

  const verification = appointment
    ? getVerificationForAppointment(
        verifications,
        appointment.id,
        appointmentPayeeId ?? appointment.payeeId,
        samePayeeAppointmentCount,
        resolveAppointmentNumericId(appointment),
      )
    : undefined;
  const { records: liveLogs, initialLoading: liveLogsInitialLoading } =
    useLiveBotTrackers(appointmentPayeeId);
  const [callLogTab, setCallLogTab] = useState<"live" | "transcript">("live");
  const [endCallLoading, setEndCallLoading] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [bargeInLoading, setBargeInLoading] = useState(false);
  const [bargeInError, setBargeInError] = useState<string | null>(null);
  const [extractionEditing, setExtractionEditing] = useState(false);
  const [extractionDraft, setExtractionDraft] = useState<
    Record<string, string>
  >({});
  const [saveEligibilityLoading, setSaveEligibilityLoading] = useState(false);
  const [saveEligibilityError, setSaveEligibilityError] = useState<
    string | null
  >(null);
  const [saveEligibilitySuccess, setSaveEligibilitySuccess] = useState<
    string | null
  >(null);
  const [supervisorPhone, setSupervisorPhone] = useState(() => {
    if (typeof window === "undefined") return "";
    return (
      window.localStorage.getItem("eva_supervisor_test_phone") ??
      import.meta.env.VITE_EVA_SUPERVISOR_TEST_PHONE ??
      ""
    );
  });
  const liveScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const liveTailRef = useRef<{ len: number; tailId: string }>({
    len: 0,
    tailId: "",
  });

  const liveSorted = useMemo(
    () =>
      [...liveLogs].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [liveLogs],
  );

  const liveChronological = useMemo(() => liveSorted.slice(-200), [liveSorted]);

  const transcriptFromTrackers = useMemo(
    () => buildTranscriptLogFromTrackers(liveSorted),
    [liveSorted],
  );
  const appointmentEvaTranscript =
    appointment &&
    typeof (appointment as { eva?: { transcript?: string } }).eva?.transcript ===
      "string"
      ? (appointment as { eva?: { transcript?: string } }).eva!.transcript!.trim()
      : "";
  const transcriptText =
    verification?.transcript?.trim() ||
    appointmentEvaTranscript ||
    transcriptFromTrackers;
  const hasTranscript = Boolean(transcriptText?.trim());

  const applicationDetailSections = useMemo(
    () => (appointment ? getApplicationDetailSections(appointment) : []),
    [appointment],
  );

  const callExtractionRows = useMemo(
    () =>
      appointment ? getCallExtractionRows(appointment, verification) : [],
    [appointment, verification],
  );

  const displayExtractionRows = useMemo(() => {
    if (!extractionEditing) return callExtractionRows;
    return applyDraftToCallExtractionRows(callExtractionRows, extractionDraft);
  }, [callExtractionRows, extractionDraft, extractionEditing]);

  const callExtractionCounts = useMemo(
    () => countFilledCallExtractions(displayExtractionRows),
    [displayExtractionRows],
  );

  const displayExtractionGroups = useMemo(() => {
    const mandatory = displayExtractionRows.filter(
      (r) => r.category === "mandatory",
    );
    const benefit = displayExtractionRows.filter((r) => r.category === "benefit");
    const history = displayExtractionRows.filter((r) => r.category === "history");
    return { mandatory, benefit, history };
  }, [displayExtractionRows]);

  useEffect(() => {
    setExtractionEditing(false);
    setExtractionDraft({});
    setSaveEligibilityError(null);
    setSaveEligibilitySuccess(null);
  }, [id]);

  const handleStartExtractionEdit = useCallback(() => {
    setExtractionDraft(callExtractionRowsToDraft(callExtractionRows));
    setExtractionEditing(true);
    setSaveEligibilityError(null);
    setSaveEligibilitySuccess(null);
  }, [callExtractionRows]);

  const handleCancelExtractionEdit = useCallback(() => {
    setExtractionEditing(false);
    setExtractionDraft({});
    setSaveEligibilityError(null);
  }, []);

  const handleExtractionFieldChange = useCallback(
    (fieldKey: string, value: string) => {
      setExtractionDraft((prev) => ({ ...prev, [fieldKey]: value }));
    },
    [],
  );

  const handleSubmitEligibility = useCallback(async () => {
    if (!id) return;
    setSaveEligibilityLoading(true);
    setSaveEligibilityError(null);
    setSaveEligibilitySuccess(null);
    try {
      const extractedData: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(extractionDraft)) {
        const trimmed = value.trim();
        extractedData[key] = trimmed === "" ? null : trimmed;
      }
      await api.post<{ saved: boolean }>(
        `/appointments/${id}/save-eligibility`,
        { extractedData },
      );
      setSaveEligibilitySuccess("Eligibility saved to Sabrina successfully.");
      setExtractionEditing(false);
      setExtractionDraft({});
      dispatch(getVerifications());
    } catch (err) {
      setSaveEligibilityError(
        err instanceof Error ? err.message : "Failed to save eligibility",
      );
    } finally {
      setSaveEligibilityLoading(false);
    }
  }, [dispatch, extractionDraft, id]);

  const onLiveScroll = useCallback(() => {
    const el = liveScrollRef.current;
    if (!el) return;
    const pad = 48;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= pad;
  }, []);

  useLayoutEffect(() => {
    if (callLogTab !== "live") return;
    const el = liveScrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    const last = liveChronological[liveChronological.length - 1];
    const tailId = last?.id ?? "";
    const len = liveChronological.length;
    const prev = liveTailRef.current;
    if (prev.len === len && prev.tailId === tailId) return;
    liveTailRef.current = { len, tailId };
    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: len <= 1 ? "auto" : "smooth",
      });
    });
  }, [liveChronological, callLogTab]);

  useEffect(() => {
    if (callLogTab !== "live") return;
    stickToBottomRef.current = true;
    const el = liveScrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      });
    }
  }, [callLogTab]);

  // useEffect(() => {
  //   if (!appointment?.payeeId) return;
  //   let cancelled = false;

  //   const fetchLiveLogs = async () => {
  //     try {
  //       const data = await api.get<BotTrackerRecord[]>(
  //         `/bot-trackers/payee/${appointment.payeeId}`,
  //       );
  //       if (!cancelled) setLiveLogs(data);
  //     } catch {
  //       if (!cancelled) setLiveLogs([]);
  //     }
  //   };

  //   fetchLiveLogs();
  //   const timer = window.setInterval(fetchLiveLogs, 3000);
  //   return () => {
  //     cancelled = true;
  //     window.clearInterval(timer);
  //   };
  // }, [appointment?.payeeId]);

  useEffect(() => {
    liveTailRef.current = { len: 0, tailId: "" };
  }, [appointmentPayeeId]);

  useEffect(() => {
    const trimmed = supervisorPhone.trim();
    if (trimmed) {
      window.localStorage.setItem("eva_supervisor_test_phone", trimmed);
    }
  }, [supervisorPhone]);

  const isCallInProgress = useMemo(
    () => isCallActiveFromTrackers(liveLogs),
    [liveLogs],
  );

  useEffect(() => {
    if (isCallInProgress) {
      setCallLogTab("live");
    }
  }, [isCallInProgress]);

  const wasCallInProgressRef = useRef(false);
  useEffect(() => {
    if (wasCallInProgressRef.current && !isCallInProgress) {
      dispatch(getVerifications());
    }
    wasCallInProgressRef.current = isCallInProgress;
  }, [dispatch, isCallInProgress]);

  /** Stays true after the call ends if any TPA segment was angry since the latest [CALL_EVENT] START. */
  const tpaAngryIndicatorActive = useMemo(
    () => hasTpaAngrySinceLatestCallStart(liveSorted),
    [liveSorted],
  );

  const supervisorBargeActive = useMemo(
    () => hasSupervisorBargeSinceLatestCallStart(liveSorted),
    [liveSorted],
  );

  const activeCallSid = useMemo(
    () => extractActiveCallSidFromTrackers(liveLogs),
    [liveLogs],
  );

  const handleHoldClick = useCallback(async () => {
    if (!activeCallSid) return;
    setHoldLoading(true);
    try {
      await api.post<{ ok: boolean }>("/twilio/put-on-hold", {
        callSid: activeCallSid,
      });
    } catch {
      // UI may still reflect hold via Twilio; poll will catch status changes.
    } finally {
      setHoldLoading(false);
    }
  }, [activeCallSid]);

  const handleEndCallClick = useCallback(async () => {
    if (!activeCallSid) return;
    setEndCallLoading(true);
    try {
      await api.post<{ ok: boolean }>("/twilio/end-call", {
        callSid: activeCallSid,
      });
    } catch {
      // Non-blocking; UI will update when stream ends or poll refreshes.
    } finally {
      setEndCallLoading(false);
    }
  }, [activeCallSid]);

  const handleBargeInClick = useCallback(async () => {
    if (!activeCallSid || !appointmentPayeeId) return;
    const phone = supervisorPhone.trim();
    if (!phone) return;
    setBargeInLoading(true);
    setBargeInError(null);
    try {
      await api.post<{ ok: boolean }>("/twilio/barge-in", {
        callSid: activeCallSid,
        supervisorPhone: phone,
        payeeId: appointmentPayeeId,
      });
    } catch {
      setBargeInError(
        "Barge-in failed. Use E.164 format (+1…), confirm Twilio credentials, and that BACKEND_URL is reachable by Twilio.",
      );
    } finally {
      setBargeInLoading(false);
    }
  }, [activeCallSid, appointmentPayeeId, supervisorPhone]);

  const handleSupervisorPhoneChange = useCallback((value: string) => {
    setSupervisorPhone(value);
    setBargeInError(null);
  }, []);

  if (!id) {
    return (
      <div className="min-h-screen bg-slate-50/50 pt-5">
        <Navbar />
        <div className="w-full px-4 sm:px-6 py-8">
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-500">Appointment not found.</p>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="mt-4 uppercase tracking-widest text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-x-3 w-400"
            >
              <Icon iconName="leftArrow" iconColor="currentColor" size="xs" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const loadingWorkflowContext =
    loadingVerifications ||
    (appointmentPayeeId ? liveLogsInitialLoading : false);

  if (loadingAppointment || (appointment && loadingWorkflowContext)) {
    return <AppointmentDetailLoadingShell navigate={navigate} />;
  }

  if (!appointment) {
    return (
      <div className="min-h-screen bg-slate-50/50 pt-5">
        <Navbar />
        <div className="w-full px-4 sm:px-6 py-8">
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-500">Appointment not found.</p>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="mt-4 uppercase tracking-widest text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-x-3 w-400"
            >
              <Icon iconName="leftArrow" iconColor="currentColor" size="xs" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const payee = appointment.payee;
  const applicationWorkflowStatus = resolveAppointmentWorkflowStatus(
    isCallInProgress,
    verification,
    liveLogs,
  );
  const applicationStatusLabel = applicationWorkflowStatus;
  const statusClass = workflowStatusBadgeClasses(applicationWorkflowStatus);
  const statusDotClass = workflowStatusDotClass(applicationWorkflowStatus);

  const fieldClass =
    "w-full rounded-lg border border-slate-200/90 bg-white px-3.5 py-2.5 text-slate-900 text-sm shadow-sm read-only:cursor-default focus:ring-0 focus:border-indigo-200";

  const patientSection = applicationDetailSections.find((s) => s.id === "patient");
  const otherApplicationSections = applicationDetailSections.filter(
    (s) => s.id !== "patient",
  );
  const {
    mandatory: mandatoryExtractionRows,
    benefit: benefitExtractionRows,
    history: historyExtractionRows,
  } = displayExtractionGroups;
  const hasExtractionFields = callExtractionRows.length > 0;

  return (
    <div className="flex flex-col h-screen max-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80 overflow-hidden pt-5">
      <Navbar />

      <div className="w-full flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8 py-6 mx-auto w-full max-w-[min(1400px,100%)]">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="group uppercase tracking-widest text-sm font-medium text-slate-600 hover:text-indigo-700 flex items-center gap-2 w-fit transition-colors"
        >
          <Icon iconName="leftArrow" iconColor="currentColor" size="xs" />
          Back to dashboard
        </button>

        <div className="mt-4 relative flex-1 min-h-0 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden ring-1 ring-slate-900/5">
          <div className="absolute top-4 right-4 sm:top-6 z-10 md:right-[calc(min(440px,42vw)+1.25rem)]">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${statusClass}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass}`}
              />
              {applicationStatusLabel}
            </span>
          </div>

          <div className="flex-1 min-h-0 pr-1 overflow-hidden flex flex-col">
            <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row md:items-stretch">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
                <section className="p-6 sm:p-8 pt-14 sm:pt-7 border-b border-slate-100 bg-slate-50/40">
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600/90 mb-7">
                    Appointment record
                  </p>
                  {patientSection ? (
                    <>
                      {sectionHeading(
                        patientSection.title,
                        patientSection.subtitle,
                      )}
                      <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-10">
                        <div className="shrink-0 flex justify-center lg:justify-start">
                          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br from-indigo-100 to-slate-100 border border-indigo-200/50 flex items-center justify-center text-3xl sm:text-4xl font-bold text-indigo-900/80 shadow-inner">
                            {payee.firstName?.[0]}
                            {payee.lastName?.[0]}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <DetailFieldGrid
                            fields={patientSection.fields.map((row) =>
                              row.key === "ssn"
                                ? {
                                    ...row,
                                    value: maskSsn(payee.ssn),
                                  }
                                : row,
                            )}
                            fieldClass={fieldClass}
                          />
                        </div>
                      </div>
                    </>
                  ) : null}
                </section>

                {otherApplicationSections.map((section, index) => (
                  <section
                    key={section.id}
                    className={`p-6 sm:p-8 border-b border-slate-100 ${
                      index === otherApplicationSections.length - 1 &&
                      callExtractionRows.length === 0
                        ? "pb-10 bg-white"
                        : ""
                    }`}
                  >
                    {sectionHeading(section.title, section.subtitle)}
                    <DetailFieldGrid
                      fields={section.fields}
                      fieldClass={fieldClass}
                    />
                  </section>
                ))}

                <section className="p-6 sm:p-8 pb-10 bg-white border-t border-slate-100">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div className="min-w-0 flex-1">
                      {sectionHeading(
                        "Call extraction",
                        "Values captured on the verification call—compare to application fields above.",
                      )}
                    </div>
                    {hasExtractionFields && !extractionEditing ? (
                      <button
                        type="button"
                        onClick={handleStartExtractionEdit}
                        className="shrink-0 text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-50 transition-colors"
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                  {saveEligibilitySuccess ? (
                    <p className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-lg px-3 py-2">
                      {saveEligibilitySuccess}
                    </p>
                  ) : null}
                  {saveEligibilityError ? (
                    <p className="mb-4 text-sm text-red-800 bg-red-50 border border-red-200/80 rounded-lg px-3 py-2">
                      {saveEligibilityError}
                    </p>
                  ) : null}
                  {hasExtractionFields ? (
                    <>
                      <p className="mb-5 text-xs font-medium text-slate-600">
                        {callExtractionCounts.filled} of{" "}
                        {callExtractionCounts.total} fields populated from the
                        call
                      </p>
                      <div className="space-y-8">
                        {mandatoryExtractionRows.length > 0 ? (
                          <div>
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1">
                              Mandatory fields
                            </h3>
                            <p className="text-xs text-slate-500 mb-4">
                              Plan and membership details collected before
                              benefit amounts.
                            </p>
                            <CallExtractionFieldGrid
                              rows={mandatoryExtractionRows}
                              fieldClass={fieldClass}
                              editing={extractionEditing}
                              onValueChange={handleExtractionFieldChange}
                            />
                          </div>
                        ) : null}

                        {benefitExtractionRows.length > 0 ||
                        historyExtractionRows.length > 0 ? (
                          <div>
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1">
                              Benefit fields
                            </h3>
                            <p className="text-xs text-slate-500 mb-4">
                              Coverage amounts, deductibles, maximums, and
                              related benefits.
                            </p>
                            {benefitExtractionRows.length > 0 ? (
                              <CallExtractionFieldGrid
                                rows={benefitExtractionRows}
                                fieldClass={fieldClass}
                                editing={extractionEditing}
                                onValueChange={handleExtractionFieldChange}
                              />
                            ) : null}
                            {historyExtractionRows.length > 0 ? (
                              <div
                                className={
                                  benefitExtractionRows.length > 0
                                    ? "mt-6 pt-6 border-t border-slate-100"
                                    : ""
                                }
                              >
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                                  History
                                </h4>
                                <p className="text-xs text-slate-500 mb-4">
                                  Procedure history codes captured on the call.
                                </p>
                                <CallExtractionFieldGrid
                                  rows={historyExtractionRows}
                                  fieldClass={fieldClass}
                                  editing={extractionEditing}
                                  onValueChange={handleExtractionFieldChange}
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {extractionEditing ? (
                        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={handleSubmitEligibility}
                            disabled={saveEligibilityLoading}
                            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          >
                            {saveEligibilityLoading
                              ? "Submitting…"
                              : "Submit to Sabrina"}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelExtractionEdit}
                            disabled={saveEligibilityLoading}
                            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
                      <p className="font-medium">No call extraction yet</p>
                      <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                        Field keys from the application will fill in here as EVA
                        captures answers on the verification call.
                      </p>
                    </div>
                  )}
                </section>
              </div>
              <aside className="flex flex-col min-h-[min(52vh,480px)] md:min-h-0 w-full md:w-[min(440px,42vw)] shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-slate-50/30 overflow-hidden">
                <CallActivitySection
                  ref={liveScrollRef}
                  callLogTab={callLogTab}
                  setCallLogTab={setCallLogTab}
                  isCallInProgress={isCallInProgress}
                  tpaAngryIndicatorActive={tpaAngryIndicatorActive}
                  supervisorBargeActive={supervisorBargeActive}
                  liveChronological={liveChronological}
                  hasTranscript={hasTranscript}
                  transcriptText={transcriptText}
                  onLiveScroll={onLiveScroll}
                  onHoldClick={handleHoldClick}
                  holdLoading={holdLoading}
                  onEndCallClick={handleEndCallClick}
                  endCallLoading={endCallLoading}
                  onBargeInClick={handleBargeInClick}
                  bargeInLoading={bargeInLoading}
                  bargeInError={bargeInError}
                  supervisorPhone={supervisorPhone}
                  onSupervisorPhoneChange={handleSupervisorPhoneChange}
                  canControlCall={Boolean(activeCallSid)}
                />
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
