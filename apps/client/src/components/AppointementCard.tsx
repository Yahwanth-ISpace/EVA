import {
  FaEdit,
  FaTrashAlt,
  FaUserMd,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaStickyNote,
} from "react-icons/fa";
import type { AppointmentRecord } from "../redux/types/appointmentsTypes";

interface Props {
  appt: AppointmentRecord;
  handleEdit: (id: string, type: "appointment" | "verification") => void;
  handleDelete: (id: string, type: "appointment" | "verification") => void;
}

export default function AppointmentCard({
  appt,
  handleEdit,
  handleDelete,
}: Props) {
  return (
    <div
      className="w-full h-fit max-w-sm rounded-2xl overflow-hidden shadow-lg transform hover:scale-[1.02] transition-all cursor-pointer"
      onClick={() => {} /* Navigate handled outside */}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-white p-5 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">
            {appt.payee.firstName} {appt.payee.lastName}
          </h2>
          <p className="text-sm opacity-90">Appointment</p>
        </div>
        <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            className="p-2 rounded-full hover:bg-white/20 transition"
            onClick={() => handleEdit(appt.id, "appointment")}
          >
            <FaEdit />
          </button>
          <button
            className="p-2 rounded-full hover:bg-white/20 transition"
            onClick={() => handleDelete(appt.id, "appointment")}
          >
            <FaTrashAlt />
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white p-5 space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <FaUserMd className="text-indigo-500" />
          <span className="font-medium">Provider:</span>{" "}
          {appt.provider.firstName} {appt.provider.lastName} (
          {appt.provider.specialty})
        </div>
        <div className="flex items-center gap-2">
          <FaMapMarkerAlt className="text-red-500" />
          <span className="font-medium">Office:</span> {appt.office.name},{" "}
          {appt.office.city}, {appt.office.state}
        </div>
        <div className="flex items-center gap-2">
          <FaCalendarAlt className="text-pink-500" />
          <span className="font-medium">Date:</span>{" "}
          {new Date(appt.date).toLocaleString()}
        </div>
        {appt.notes && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FaStickyNote className="text-yellow-500" />
            {appt.notes}
          </div>
        )}
      </div>
    </div>
  );
}
