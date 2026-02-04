import { useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import Navbar from "../components/Navbar";
import type { VerificationRecord } from "../redux/types/verificationTypes";
import type { AppointmentRecord } from "../redux/types/appointmentsTypes";
import Icon from "../components/Icons";

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
  const dobFormatted = payee.dob
    ? new Date(payee.dob).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";
  const address = "816 West Main Street, Danville, Virginia, 24541";

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-50/50 overflow-hidden pt-5">
      <Navbar />

      <div className="w-full flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-8">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-x-3 w-400"
        >
          <Icon iconName="leftArrow" iconColor="currentColor" size="xs" />
          Back to Dashboard
        </button>

        <div className="mt-5 relative flex-1 min-h-0 flex flex-col bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
          {/* Pill - top right */}
          <div className="absolute top-5 right-8 z-10">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shadow-sm ${
                verification
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                  : "bg-amber-50 text-amber-700 border border-amber-100"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  verification ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {verification ? "Verified" : "In progress"}
            </span>
          </div>

          {/* Scrollable content inside card - wrapper insets scrollbar from rounded corner */}
          <div className="flex-1 min-h-0 pr-1 overflow-hidden">
            <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar">
              {/* Patient details header */}
              <div className="p-6 sm:p-8 pt-12">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-5">
                  Patient details
                </h3>
                <div className="flex flex-col sm:flex-row sm:items-start gap-10 sm:gap-12">
                  <div className="shrink-0 order-2 sm:order-1">
                    <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-4xl sm:text-5xl font-semibold text-slate-600">
                      {payee.firstName?.[0]}
                      {payee.lastName?.[0]}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-4 order-1 sm:order-2">
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                          First name
                        </span>
                        <span className="text-lg font-semibold text-slate-800">
                          {payee.firstName}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Last name
                        </span>
                        <span className="text-lg font-semibold text-slate-800">
                          {payee.lastName}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Address
                      </span>
                      <span className="text-slate-700">{address}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Date of birth
                      </span>
                      <span className="text-slate-700">{dobFormatted}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Verification fields */}
              <div className="p-6 sm:p-8">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
                  Verification details
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { value: verification?.coverage, label: "Coverage" },
                    { value: verification?.deductible, label: "Deductible" },
                    { value: verification?.copay, label: "Copay" },
                    { value: verification?.validity, label: "Validity" },
                  ].map(({ value, label }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">
                        {label}
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={value ?? ""}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 text-sm read-only:cursor-default focus:ring-0 focus:border-slate-200"
                      />
                    </div>
                  ))}
                </div>
                {!verification && (
                  <p className="mt-3 text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    No verification record yet. Data will appear after the
                    verification call.
                  </p>
                )}
              </div>

              {/* Transcript - shown when verified, from database */}
              {
                <div>
                  <div className="h-px bg-slate-100" />
                  <div className="p-6 sm:p-8">
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
                      Transcript
                    </h3>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap font-mono">
                        {(verification && verification.transcript?.trim()) ||
                          "No transcript available."}
                      </p>
                    </div>
                  </div>
                </div>
              }

              <div className="h-px bg-slate-100" />

              {/* Plan details */}
              <div className="p-6 sm:p-8">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">
                  Plan details
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {STATIC_FIELDS.map(({ label, value }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">
                        {label}
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={value}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-800 text-sm read-only:cursor-default"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
