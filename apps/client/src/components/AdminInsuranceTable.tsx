import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css"; // Ensure skeleton CSS is imported
import { Link } from "react-router-dom";
import type { VerificationRecord } from "../redux/types/verificationTypes";
import { getVerificationFieldRows } from "../utils/verificationDisplay";
import StatusBadge from "./StatusBadges";

interface Props {
  records: VerificationRecord[];
  loading: boolean; // Added loading prop for skeleton display
}

export default function AdminInsuranceTable({ records, loading }: Props) {
  return (
    // Container div with shadow and rounded corners
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="whitespace-nowrap px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Patient
              </th>

              <th className="whitespace-nowrap px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Appointment
              </th>

              <th className="whitespace-nowrap px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status
              </th>

              <th className="whitespace-nowrap px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Verification details
              </th>

              <th className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {records.map((record) => {
              const rows = getVerificationFieldRows(record);

              return (
                <tr
                  key={record.id}
                  className="transition-colors hover:bg-gray-50"
                >
                  {/* Patient */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {record.patientName}
                    </div>

                    <div className="mt-0.5 text-xs text-gray-500">
                      ID: {record.id}
                    </div>
                  </td>

                  {/* Appointment */}
                  <td className="whitespace-nowrap px-6 py-4 text-gray-600">
                    #{record.appointmentId}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <StatusBadge status={record.status} />
                  </td>

                  {/* Verification */}
                  <td className="px-6 py-4">
                    <div className="max-w-md space-y-1">
                      {rows.slice(0, 3).map((r) => (
                        <div key={r.key} className="text-sm">
                          <span className="font-medium text-gray-600">
                            {r.label}:
                          </span>{" "}
                          <span className="text-gray-900">
                            {r.value || "—"}
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
                  <td className="whitespace-nowrap px-6 py-4 text-right">
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
  );
}