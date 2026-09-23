// src/pages/InsuranceDetails.tsx

import { useParams, Link } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "../redux/store";
import { getVerificationById } from "../redux/actions/verificationActions";

export default function InsuranceDetails() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();

  const { verification, loading, error } = useSelector(
    (state: RootState) => state.verificationsState,
  );

  useEffect(() => {
    if (id) {
      dispatch(getVerificationById(id));
    }
  }, [id, dispatch]);

  // ---------------------------------------------------------
  // Loading
  // ---------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-gray-500">
              Loading verification details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // Error
  // ---------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
            <h2 className="font-semibold">Unable to load verification</h2>

            <p className="mt-1 text-sm">{error}</p>

            <Link
              to="/insurance"
              className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              ← Back to verifications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // No record
  // ---------------------------------------------------------
  if (!verification) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">Verification record not found.</p>

            <Link
              to="/insurance"
              className="mt-4 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              ← Back to verifications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // Extracted data
  // ---------------------------------------------------------
  const extractedData = verification.extractedData ?? {};

  // ---------------------------------------------------------
  // Procedure history
  // ---------------------------------------------------------
  const historyRows = Object.entries(extractedData).filter(([key]) =>
    key.startsWith("history."),
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* =====================================================
            BACK BUTTON
        ====================================================== */}
        <div>
          <Link
            to="/insurance"
            className="inline-flex items-center text-sm font-medium text-indigo-600 transition hover:text-indigo-800"
          >
            ← Back to verifications
          </Link>
        </div>

        {/* =====================================================
            HEADER
        ====================================================== */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Insurance Verification
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Insurance verification details and call information
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Appointment
              </div>

              <div className="mt-1 text-lg font-semibold text-gray-900">
                #{verification.appointmentId}
              </div>
            </div>
          </div>
        </div>

        {/* =====================================================
            VERIFICATION INFORMATION
        ====================================================== */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader title="Verification Information" />

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Verification ID" value={verification.id} />

            <InfoItem label="Payee ID" value={verification.payeeId} />

            <InfoItem
              label="Appointment ID"
              value={verification.appointmentId}
            />

            <InfoItem
              label="Verification Requirement ID"
              value={verification.verificationRequirementId}
            />

            <InfoItem
              label="Created At"
              value={
                verification.createdAt
                  ? new Date(verification.createdAt).toLocaleString()
                  : null
              }
            />
          </div>
        </section>

        {/* =====================================================
            INSURANCE INFORMATION
        ====================================================== */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader title="Insurance Information" />

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Carrier Name" value={extractedData.carrierName} />

            <InfoItem label="Group Name" value={extractedData.groupName} />

            <InfoItem label="Group Number" value={extractedData.groupNumber} />

            <InfoItem label="Network" value={extractedData.network} />

            <InfoItem
              label="Effective Date"
              value={extractedData.effectiveDate}
            />
          </div>
        </section>

        {/* =====================================================
            COVERAGE
        ====================================================== */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader title="Coverage" />

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem
              label="Preventive"
              value={extractedData.preventive}
              suffix="%"
            />

            <InfoItem label="Basic" value={extractedData.basic} suffix="%" />

            <InfoItem label="Major" value={extractedData.major} suffix="%" />

            <InfoItem
              label="Yearly Maximum Amount"
              value={extractedData.yearlyMaxAmount}
            />

            <InfoItem
              label="Orthodontics Maximum"
              value={extractedData.orthoMaximum}
            />
          </div>
        </section>

        {/* =====================================================
            DEDUCTIBLES
        ====================================================== */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader title="Deductibles" />

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem
              label="Individual Deductible"
              value={extractedData.individualDeductible}
            />

            <InfoItem
              label="Family Deductible"
              value={extractedData.familyDeductible}
            />

            <InfoItem
              label="Individual Deductible Met"
              value={extractedData.individualDeductibleMet}
            />

            <InfoItem
              label="Family Deductible Met"
              value={extractedData.familyDeductibleMet}
            />

            <InfoItem
              label="Individual Met Amount"
              value={extractedData.individualMetAmount}
            />

            <InfoItem
              label="Family Met Amount"
              value={extractedData.familyMetAmount}
            />
          </div>
        </section>

        {/* =====================================================
            MAXIMUM USAGE
        ====================================================== */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader title="Maximum Usage" />

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem
              label="Yearly Maximum Used"
              value={extractedData.yearlyMaxUsed}
            />

            <InfoItem
              label="Family Maximum Used"
              value={extractedData.familyMaxUsed}
            />
          </div>
        </section>

        {/* =====================================================
            PROCEDURE HISTORY
        ====================================================== */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader title="Procedure History" />

          {historyRows.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {historyRows.map(([key, value]) => {
                const procedureCode = key.replace("history.", "");

                return (
                  <div
                    key={key}
                    className="grid grid-cols-1 gap-2 px-6 py-4 sm:grid-cols-3"
                  >
                    <div className="font-medium text-gray-700">
                      {procedureCode}
                    </div>

                    <div className="break-words text-gray-900 sm:col-span-2">
                      {String(value || "N/A")}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500">
              No procedure history available.
            </div>
          )}
        </section>

        {/* =====================================================
            TRANSCRIPT
        ====================================================== */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader title="Call Transcript" />

          <div className="p-6">
            {verification.transcript ? (
              <div className="max-h-[650px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-5 font-mono text-sm leading-6 text-gray-700">
                {verification.transcript}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No transcript available.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* =========================================================
   SECTION HEADER
========================================================= */

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="border-b border-gray-200 px-6 py-4">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </div>
  );
}

/* =========================================================
   INFORMATION ITEM
========================================================= */

interface InfoItemProps {
  label: string;
  value?: string | number | null;
  suffix?: string;
}

function InfoItem({ label, value, suffix }: InfoItemProps) {
  const hasValue = value !== null && value !== undefined && value !== "";

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>

      <div className="mt-1 break-words text-sm font-medium text-gray-900">
        {hasValue ? `${value}${suffix ?? ""}` : "N/A"}
      </div>
    </div>
  );
}
