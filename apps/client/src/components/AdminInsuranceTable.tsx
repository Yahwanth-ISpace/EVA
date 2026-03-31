import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css"; // Ensure skeleton CSS is imported
import { Link } from "react-router-dom";
import type { VerificationRecord } from "../redux/types/verificationTypes";
import { getVerificationFieldRows } from "../utils/verificationDisplay";

interface Props {
  records: VerificationRecord[];
  loading: boolean; // Added loading prop for skeleton display
}

export default function AdminInsuranceTable({ records, loading }: Props) {
  return (
    // Container div with shadow and rounded corners
    <div className="overflow-x-auto shadow-md rounded-lg">
      <table className="min-w-full table-auto text-sm text-left text-gray-500">
        <thead className="bg-indigo-100 text-gray-900">
          <tr>
            <th className="px-6 py-3">Name</th>
            <th className="px-6 py-3">Verification fields</th>
            <th className="px-6 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            // Skeleton loading rows
            [...Array(5)].map((_, i) => (
              <tr key={i} className="border-b bg-white">
                {[...Array(3)].map((_, j) => (
                  <td key={j} className="px-6 py-4">
                    <Skeleton height={20} width="100%" />
                  </td>
                ))}
              </tr>
            ))
          ) : records.length === 0 ? (
            // Display message when no records are available
            <tr>
              <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                No insurance records found.
              </td>
            </tr>
          ) : (
            // Actual data rows
            records.map((record) => {
              const rows = getVerificationFieldRows(record);
              return (
              <tr
                key={record.id}
                className="bg-white border-b hover:bg-indigo-50"
              >
                <td className="px-6 py-3">
                  {record.payee.firstName} {record.payee.lastName}
                </td>
                <td className="px-6 py-3 max-w-md">
                  {rows.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <ul className="space-y-1 text-gray-700">
                      {rows.map((r) => (
                        <li key={r.key}>
                          <span className="font-medium text-gray-800">
                            {r.label}:
                          </span>{" "}
                          {r.value || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-6 py-3">
                  <Link
                    to={`/insurance/${record.id}`}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
