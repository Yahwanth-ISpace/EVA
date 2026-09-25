import { useMemo, useState } from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { FaSearch } from "react-icons/fa";
import { Link } from "react-router-dom";

import type { VerificationRecord } from "../redux/types/verificationTypes";
import { getVerificationFieldRows } from "../utils/verificationDisplay";
import StatusBadge from "./StatusBadges";

interface Props {
  records: VerificationRecord[];
  loading: boolean;
}

type SortBy = "date_desc" | "date_asc" | "patient_asc" | "status_asc";

const SKELETON_ROW_COUNT = 8;

export default function AdminInsuranceTable({ records, loading }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  // Latest by default
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");

  const filteredAndSortedRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = records.filter((record) => {
      if (!q) return true;

      const rows = getVerificationFieldRows(record);

      const verificationDetails = rows
        .map((row) => `${row.label} ${row.value}`)
        .join(" ")
        .toLowerCase();

      const patientName = record.patientName?.toLowerCase() ?? "";
      const appointmentId = String(record.appointmentId ?? "").toLowerCase();
      const status = String(record.status ?? "").toLowerCase();

      return (
        patientName.includes(q) ||
        appointmentId.includes(q) ||
        status.includes(q) ||
        verificationDetails.includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;

      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      switch (sortBy) {
        case "date_desc":
          return dateB - dateA;

        case "date_asc":
          return dateA - dateB;

        case "patient_asc": {
          const patientA = a.patientName?.toLowerCase() ?? "";

          const patientB = b.patientName?.toLowerCase() ?? "";

          const result = patientA.localeCompare(patientB);

          if (result !== 0) {
            return result;
          }

          return dateB - dateA;
        }

        case "status_asc": {
          const statusA = String(a.status ?? "").toLowerCase();

          const statusB = String(b.status ?? "").toLowerCase();

          const result = statusA.localeCompare(statusB);

          if (result !== 0) {
            return result;
          }

          return dateB - dateA;
        }

        default:
          return 0;
      }
    });
  }, [records, searchQuery, sortBy]);

  return (
    <div className="flex flex-col relative min-h-0 flex-1 overflow-hidden">
      {/* Header / Search / Sort */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
            Verification Records
          </h2>
        </div>

        {!loading && records.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto sm:ml-auto">
            {/* Search */}
            <label htmlFor="verification-search" className="sr-only">
              Search verification records
            </label>

            <div className="relative flex-1 min-w-[180px] max-w-xs sm:flex-initial sm:min-w-[220px]">
              <FaSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
                aria-hidden
              />

              <input
                id="verification-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, appointment…"
                autoComplete="off"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            {/* Sort */}
            <label htmlFor="verification-sort" className="sr-only">
              Sort verification records by
            </label>

            <select
              id="verification-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="h-9 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="date_desc">Date (newest first)</option>

              <option value="date_asc">Date (oldest first)</option>

              <option value="patient_asc">Patient (A–Z)</option>

              <option value="status_asc">Status (A–Z)</option>
            </select>
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div className="shrink-0 h-px bg-slate-200 my-4" role="presentation" />

      {/* Table content */}
      <div className="content-wrapper flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
        {/* Loading */}
        {loading ? (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Patient</th>

                    <th className="px-4 py-3">Appointment</th>

                    <th className="px-4 py-3">Date</th>

                    <th className="px-4 py-3">Status</th>

                    <th className="px-4 py-3">Verification details</th>

                    <th className="px-3 py-3 w-32 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {Array.from({
                    length: SKELETON_ROW_COUNT,
                  }).map((_, index) => (
                    <tr key={`skeleton-${index}`}>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <Skeleton width={140} height={16} />

                          <Skeleton width={90} height={12} />
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <Skeleton width={90} height={16} />
                      </td>

                      <td className="px-4 py-4">
                        <Skeleton width={100} height={16} />
                      </td>

                      <td className="px-4 py-4">
                        <Skeleton width={90} height={28} borderRadius={8} />
                      </td>

                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <Skeleton width={220} height={14} />

                          <Skeleton width={180} height={14} />

                          <Skeleton width={200} height={14} />
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <Skeleton width={110} height={38} borderRadius={8} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : records.length === 0 ? (
          /* No records */
          <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-slate-500 text-center text-sm">
              No verification records yet.
            </p>

            <p className="text-slate-400 text-center text-xs mt-1">
              Verification records will appear here.
            </p>
          </div>
        ) : filteredAndSortedRecords.length === 0 ? (
          /* No search results */
          <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-slate-500 text-center text-sm">
              No verification records match your search.
            </p>

            <p className="text-slate-400 text-center text-xs mt-1">
              Try a different search term.
            </p>
          </div>
        ) : (
          /* Actual table */
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Patient</th>

                    <th className="px-4 py-3">Appointment</th>

                    <th className="px-4 py-3 whitespace-nowrap">Date</th>

                    <th className="px-4 py-3 whitespace-nowrap">Status</th>

                    <th className="px-4 py-3">Verification details</th>

                    <th className="px-3 py-3 w-32 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredAndSortedRecords.map((record) => {
                    const rows = getVerificationFieldRows(record);

                    const dateStr = record.createdAt
                      ? new Date(record.createdAt).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )
                      : "—";

                    return (
                      <tr
                        key={record.id}
                        className="transition-colors hover:bg-slate-50/80"
                      >
                        {/* Patient */}
                        <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px]">
                          <span className="line-clamp-2">
                            {record.patientName}
                          </span>

                          <span className="mt-1 block text-xs text-slate-400">
                            ID: {record.id}
                          </span>
                        </td>

                        {/* Appointment */}
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          #{record.appointmentId}
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {dateStr}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge status={record.status} />
                        </td>

                        {/* Verification */}
                        <td className="px-4 py-3">
                          <div className="max-w-md space-y-1">
                            {rows.slice(0, 3).map((row) => (
                              <div key={row.key} className="text-sm">
                                <span className="font-medium text-slate-600">
                                  {row.label}:
                                </span>{" "}
                                <span className="text-slate-800">
                                  {row.value || "—"}
                                </span>
                              </div>
                            ))}

                            {rows.length > 3 && (
                              <span className="text-xs font-medium text-indigo-600">
                                +{rows.length - 3} more
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Action */}
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <Link
                            to={`/insurance/${record.id}`}
                            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:text-indigo-600"
                          >
                            View details
                            <span className="ml-1.5">→</span>
                          </Link>
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
