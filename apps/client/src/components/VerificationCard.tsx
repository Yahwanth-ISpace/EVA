import {
  FaEdit,
  FaTrashAlt,
  FaPercentage,
  FaDollarSign,
  FaShieldAlt,
  FaCalendarAlt,
} from "react-icons/fa";
import type { VerificationRecord } from "../redux/types/verificationTypes";

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
  return (
    <div
      className="w-full h-fit max-w-sm rounded-2xl overflow-hidden shadow-lg transform hover:scale-[1.02] transition-all cursor-pointer"
      onClick={() => {} /* Navigate handled outside */}
    >
      {/* Top */}
      <div className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white p-5 flex justify-between items-start">
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
      <div className="bg-white p-5 space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <FaPercentage className="text-indigo-500" />
          <span className="font-medium">Coverage:</span> {record.coverage}
        </div>
        <div className="flex items-center gap-2">
          <FaDollarSign className="text-green-500" />
          <span className="font-medium">Copay:</span> {record.copay}
        </div>
        <div className="flex items-center gap-2">
          <FaShieldAlt className="text-yellow-500" />
          <span className="font-medium">Deductible:</span> {record.deductible}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FaCalendarAlt className="text-pink-500" />
          Valid till: {record.validity}
        </div>
      </div>
    </div>
  );
}
