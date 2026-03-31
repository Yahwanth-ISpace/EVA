import {
  FaEdit,
  FaTrashAlt,
  FaPercentage,
  FaDollarSign,
  FaShieldAlt,
  FaCalendarAlt,
} from "react-icons/fa";
import type { VerificationRecord } from "../redux/types/verificationTypes";
import { getVerificationFieldRows } from "../utils/verificationDisplay";

interface Props {
  record: VerificationRecord;
  handleEdit: (id: string, type: "appointment" | "verification") => void;
  handleDelete: (id: string, type: "appointment" | "verification") => void;
}

export default function VerificationCard({
  record,
  handleEdit,
  handleDelete,
}: Props) {
  const rows = getVerificationFieldRows(record);

  return (
    <div
      className="w-full h-fit max-w-sm rounded-2xl overflow-hidden shadow-lg transform hover:scale-[1.02] transition-all cursor-pointer"
      onClick={() => {} /* Navigate handled outside */}
    >
      {/* Top */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-5 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">
            {record.payee.firstName} {record.payee.lastName}
          </h2>
          <p className="text-sm opacity-90">Insurance Holder</p>
        </div>
        <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            className="p-2 rounded-full hover:bg-white/20 transition"
            onClick={() => handleEdit(record.id, "verification")}
          >
            <FaEdit />
          </button>
          <button
            className="p-2 rounded-full hover:bg-white/20 transition"
            onClick={() => handleDelete(record.id, "verification")}
          >
            <FaTrashAlt />
          </button>
        </div>
      </div>

      {/* Bottom */}
      <div className="bg-white p-5 space-y-3 text-sm">
        {rows.length === 0 ? (
          <p className="text-gray-500 text-sm">No captured fields yet.</p>
        ) : (
          rows.map((row, i) => {
            const Icon = [FaPercentage, FaDollarSign, FaShieldAlt, FaCalendarAlt][
              i % 4
            ];
            return (
              <div key={row.key} className="flex items-start gap-2">
                <Icon className="text-indigo-500 shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium">{row.label}:</span>{" "}
                  {row.value || "—"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
