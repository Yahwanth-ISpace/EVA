import { useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RootState } from "../redux/store";
import Navbar from "../components/Navbar";
import type { VerificationRecord } from "../redux/types/verificationTypes";
import type { AppointmentRecord } from "../redux/types/appointmentsTypes";
import Icon from "../components/Icons";
import { api } from "../utils/api";
import {
  extractActiveCallSidFromTrackers,
  isCallActiveFromTrackers,
} from "../utils/botTracker";
import type { BotTrackerRecord } from "../utils/botTracker";
import {
  CallActivitySection,
  type CallFooterPhase,
} from "../components/CallActivitySection";
import { getVerificationFieldRows } from "../utils/verificationDisplay";

const STATIC_FIELDS = [
  { label: "Family Deductible", value: "$20" },
  { label: "History", value: "3" },
  { label: "Frequency", value: "3" },
  { label: "Code", value: "D1029" },
  { label: "Major", value: "80%" },
  { label: "Minor", value: "10%" },
  { label: "Group ID", value: "M01298" },
];

function getVerificationForPayee(
  verifications: VerificationRecord[],
  payeeId: string,
): VerificationRecord | undefined {
  return verifications.find((v) => v.payee?.id === payeeId);
}

function formatAppointmentWhen(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function providerDisplayName(p: AppointmentRecord["provider"]): string {
  if (!p) return "—";
  const n = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  if (n) return n;
  return p.name?.trim() || "—";
}

function maskSsn(ssn: string | undefined | null): string {
  if (!ssn?.trim()) return "—";
  const d = ssn.replace(/\D/g, "");
  if (d.length >= 4) return `•••-••-${d.slice(-4)}`;
  return "On file";
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { appointments } = useSelector(
    (state: RootState) => state.appointmentsState,
  );
  const { verifications } = useSelector(
    (state: RootState) => state.verificationsState,
  );

  const appointment = appointments.find((a: AppointmentRecord) => a.id === id);
  const verification = appointment
    ? getVerificationForPayee(verifications, appointment.payeeId)
    : undefined;
  const [liveLogs, setLiveLogs] = useState<BotTrackerRecord[]>([]);
  const [callLogTab, setCallLogTab] = useState<"live" | "transcript">("live");
  const [callFooterPhase, setCallFooterPhase] =
    useState<CallFooterPhase>("merge");
  const [endCallLoading, setEndCallLoading] = useState(false);
  const liveScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const liveTailRef = useRef<{ len: number; tailId: string }>({
    len: 0,
    tailId: "",
  });

  const liveChronological = useMemo(() => {
    return [...liveLogs]
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .slice(-200);
  }, [liveLogs]);

  const transcriptText = verification?.transcript?.trim() ?? "";
  const hasTranscript = Boolean(transcriptText);

  const verificationFieldRows = useMemo(
    () => getVerificationFieldRows(verification),
    [verification],
  );

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

  useEffect(() => {
    if (!appointment?.payeeId) return;
    let cancelled = false;

    const fetchLiveLogs = async () => {
      try {
        const data = await api.get<BotTrackerRecord[]>(
          `/bot-trackers/payee/${appointment.payeeId}`,
        );
        if (!cancelled) setLiveLogs(data);
      } catch {
        if (!cancelled) setLiveLogs([]);
      }
    };

    fetchLiveLogs();
    const timer = window.setInterval(fetchLiveLogs, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [appointment?.payeeId]);

  useEffect(() => {
    liveTailRef.current = { len: 0, tailId: "" };
  }, [appointment?.payeeId]);

  if (!id || !appointment) {
    return (
      <div className="min-h-screen bg-slate-50/50 pt-5">
        <Navbar />
        <div className="w-full px-4 sm:px-6 py-8">
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-500">Appointment not found.</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="mt-4 text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-x-3 w-400"
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
  const office = appointment.office;
  const provider = appointment.provider;
  const dobFormatted = payee.dob
    ? new Date(payee.dob).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";
  const officeAddressLine = office
    ? [
        office.address,
        [office.city, office.state].filter(Boolean).join(", "),
        office.zip,
      ]
        .filter(Boolean)
        .join(", ")
    : "—";
  const isCallInProgress = useMemo(
    () => isCallActiveFromTrackers(liveLogs),
    [liveLogs],
  );

  const activeCallSid = useMemo(
    () => extractActiveCallSidFromTrackers(liveLogs),
    [liveLogs],
  );

  useEffect(() => {
    if (!isCallInProgress) setCallFooterPhase("merge");
  }, [isCallInProgress]);

  const handleMergeInFooterClick = useCallback(() => {
    if (!isCallInProgress) return;
    setCallFooterPhase("end");
  }, [isCallInProgress]);

  const handleEndCallClick = useCallback(async () => {
    if (!activeCallSid) return;
    setEndCallLoading(true);
    try {
      await api.post<{ ok: boolean }>("/twilio/end-call", {
        callSid: activeCallSid,
      });
      setCallFooterPhase("merge");
    } catch {
      // Non-blocking; UI will update when stream ends or poll refreshes.
    } finally {
      setEndCallLoading(false);
    }
  }, [activeCallSid]);
  /** Verification workflow only: scheduled → in progress → verified */
  const applicationStatusLabel = verification
    ? "verified"
    : isCallInProgress
      ? "in progress"
      : "scheduled";
  const statusClass = verification
    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
    : isCallInProgress
      ? "bg-amber-50 text-amber-700 border border-amber-100"
      : "bg-slate-100 text-slate-700 border border-slate-200";
  const statusDotClass = verification
    ? "bg-emerald-500"
    : isCallInProgress
      ? "bg-amber-500"
      : "bg-slate-500";

  const fieldClass =
    "w-full rounded-lg border border-slate-200/90 bg-white px-3.5 py-2.5 text-slate-900 text-sm shadow-sm read-only:cursor-default focus:ring-0 focus:border-indigo-200";

  return (
    <div className="flex flex-col h-screen max-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80 overflow-hidden pt-5">
      <Navbar />

      <div className="w-full flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8 py-6 mx-auto w-full max-w-[min(1400px,100%)]">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="group text-sm font-medium text-slate-600 hover:text-indigo-700 flex items-center gap-2 w-fit transition-colors"
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
              {/* Patient */}
              <section className="p-6 sm:p-8 pt-14 sm:pt-7 border-b border-slate-100 bg-slate-50/40">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600/90 mb-7">
                  Appointment record
                </p>
                <div className="flex items-center gap-2 mb-5">
                  <span className="flex h-8 w-1 rounded-full bg-indigo-600 shrink-0" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                      Patient
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Demographics used for eligibility and verification.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-10">
                  <div className="shrink-0 flex justify-center lg:justify-start">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br from-indigo-100 to-slate-100 border border-indigo-200/50 flex items-center justify-center text-3xl sm:text-4xl font-bold text-indigo-900/80 shadow-inner">
                      {payee.firstName?.[0]}
                      {payee.lastName?.[0]}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        First name
                      </label>
                      <p className={fieldClass}>{payee.firstName || "—"}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Last name
                      </label>
                      <p className={fieldClass}>{payee.lastName || "—"}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Date of birth
                      </label>
                      <p className={fieldClass}>{dobFormatted}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        SSN (masked)
                      </label>
                      <p className={fieldClass}>{maskSsn(payee.ssn)}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Visit & provider */}
              <section className="p-6 sm:p-8 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex h-8 w-1 rounded-full bg-indigo-600 shrink-0" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                      Visit & provider
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      When and where care is scheduled; who is treating the
                      patient.
                    </p>
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Appointment
                    </label>
                    <p className={`${fieldClass} !py-2.5`}>
                      {formatAppointmentWhen(appointment.date)}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Provider
                    </label>
                    <p className={`${fieldClass} !py-2.5`}>
                      {providerDisplayName(provider)}
                      {provider?.specialty ? (
                        <span className="text-slate-500 font-normal">
                          {" "}
                          · {provider.specialty}
                        </span>
                      ) : null}
                    </p>
                    {provider?.npi ? (
                      <p className="text-xs text-slate-500 mt-1.5 ml-2">
                        NPI {provider.npi}
                        {provider.phone ? ` · ${provider.phone}` : ""}
                      </p>
                    ) : provider?.phone ? (
                      <p className="text-xs text-slate-500 mt-1.5 ml-2">
                        {provider.phone}
                      </p>
                    ) : null}
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                      Office / service location
                    </label>
                    <p className={`${fieldClass} !py-2.5`}>
                      {office?.name ? (
                        <>
                          <span className="font-medium text-slate-900">
                            {office.name}
                          </span>
                          <span className="text-slate-600">
                            {" "}
                            — {officeAddressLine}
                          </span>
                        </>
                      ) : (
                        officeAddressLine
                      )}
                    </p>
                    {office?.phone ? (
                      <p className="text-xs text-slate-500 mt-1.5">
                        Phone {office.phone}
                      </p>
                    ) : null}
                  </div>
                  {appointment.notes?.trim() ? (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        Notes
                      </label>
                      <p className="rounded-lg border border-slate-200/90 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-700 whitespace-pre-wrap">
                        {appointment.notes}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Insurance verification */}
              <section className="p-6 sm:p-8 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex h-8 w-1 rounded-full bg-indigo-600 shrink-0" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                      Insurance verification
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Benefits confirmed on the call—what applies to this claim.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {verificationFieldRows.map((row) => (
                    <div key={row.key}>
                      <label
                        className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5"
                        title={row.questionHint}
                      >
                        {row.label}
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={row.value}
                        className={fieldClass}
                        placeholder="—"
                        title={row.questionHint}
                      />
                    </div>
                  ))}
                </div>
                {verification && verificationFieldRows.length === 0 && (
                  <p className="mt-3 text-sm text-slate-500">
                    No verification fields to show yet. They will match your
                    verification requirement and fill in as data is captured on
                    the call.
                  </p>
                )}
                {!verification && (
                  <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
                    <p className="font-medium">No verification on file yet</p>
                    <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                      Coverage details will populate after the verification call
                      completes successfully.
                    </p>
                  </div>
                )}
              </section>

              {/* Benefit summary (plan) */}
              <section className="p-6 sm:p-8 pb-10 bg-white">
                <div className="flex items-center gap-2 mb-4">
                  <span className="flex h-8 w-1 rounded-full bg-indigo-600 shrink-0" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                      Benefit summary
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Plan-level limits and codes—use alongside verified
                      coverage above.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {STATIC_FIELDS.map(({ label, value }) => (
                    <div key={label}>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                        {label}
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={value}
                        className={fieldClass}
                      />
                    </div>
                  ))}
                </div>
              </section>
              </div>
              <aside className="flex flex-col min-h-[min(52vh,480px)] md:min-h-0 w-full md:w-[min(440px,42vw)] shrink-0 border-t md:border-t-0 md:border-l border-slate-200 bg-slate-50/30 overflow-hidden">
                <CallActivitySection
                  ref={liveScrollRef}
                  callLogTab={callLogTab}
                  setCallLogTab={setCallLogTab}
                  isCallInProgress={isCallInProgress}
                  liveChronological={liveChronological}
                  hasTranscript={hasTranscript}
                  transcriptText={transcriptText}
                  onLiveScroll={onLiveScroll}
                  callFooterPhase={callFooterPhase}
                  onMergeInClick={handleMergeInFooterClick}
                  onEndCallClick={handleEndCallClick}
                  endCallLoading={endCallLoading}
                  canEndCall={Boolean(activeCallSid)}
                />
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
