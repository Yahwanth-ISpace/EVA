// PatientTabs.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppointmentRecord, VerificationRecord } from "../types/insurance";
import {
  FaEdit,
  FaTrashAlt,
  FaPercentage,
  FaDollarSign,
  FaShieldAlt,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaStickyNote,
  FaUserMd,
} from "react-icons/fa";

interface Props {
  verifications: VerificationRecord[];
  appointments: AppointmentRecord[];
}

export default function PatientTabs({ verifications, appointments }: Props) {
  const [activeTab, setActiveTab] = useState<"appointments" | "verifications">(
    "appointments"
  );
  const navigate = useNavigate();

  const handleEdit = (id: string) => {
    // Navigate to the edit page
    navigate(`/insurance/${id}/edit`);
  };

  const handleDelete = (id: string) => {
    // Confirm before deleting
    const confirmed = window.confirm(
      "Are you sure you want to delete this record?"
    );
    if (!confirmed) return;

    // Perform delete request (replace with your API call)
    fetch(`/api/insurance/${id}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to delete");
        alert("Record deleted successfully.");
        // Optionally refresh or remove from local state
      })
      .catch((err) => {
        console.error(err);
        alert("Something went wrong while deleting.");
      });
  };

  return (
    <div className="">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`px-4 py-2 font-medium ${
            activeTab === "appointments"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("appointments")}
        >
          Appointments
        </button>
        <button
          className={`px-4 py-2 font-medium ${
            activeTab === "verifications"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("verifications")}
        >
          Verifications
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "verifications" && (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {verifications.map((record) => (
            <div
              key={record.id}
              className="w-full max-w-sm rounded-2xl overflow-hidden shadow-lg transform hover:scale-[1.02] transition-all cursor-pointer"
              onClick={() => navigate(`/insurance/${record.id}`)}
            >
              {/* Top Section - Name & Actions */}
              <div className="bg-gradient-to-r from-indigo-500 to-blue-500 text-white p-5 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">
                    {record.payee.firstName} {record.payee.lastName}
                  </h2>
                  <p className="text-sm opacity-90">Insurance Holder</p>
                </div>
                <div
                  className="flex gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="p-2 rounded-full hover:bg-white/20 transition"
                    onClick={() => handleEdit(record.id)}
                  >
                    <FaEdit />
                  </button>
                  <button
                    className="p-2 rounded-full hover:bg-white/20 transition"
                    onClick={() => handleDelete(record.id)}
                  >
                    <FaTrashAlt />
                  </button>
                </div>
              </div>

              {/* Bottom Section - Details */}
              <div className="bg-white p-5 space-y-4 text-sm">
                <div className="flex items-center gap-2">
                  <FaPercentage className="text-indigo-500" />
                  <span className="font-medium">Coverage:</span>{" "}
                  {record.coverage}
                </div>
                <div className="flex items-center gap-2">
                  <FaDollarSign className="text-green-500" />
                  <span className="font-medium">Copay:</span> {record.copay}
                </div>
                <div className="flex items-center gap-2">
                  <FaShieldAlt className="text-yellow-500" />
                  <span className="font-medium">Deductible:</span>{" "}
                  {record.deductible}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <FaCalendarAlt className="text-pink-500" />
                  Valid till: {record.validity}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "appointments" && (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {appointments.map((appt) => (
            <div
              key={appt.id}
              className="w-full max-w-sm rounded-2xl overflow-hidden shadow-lg transform hover:scale-[1.02] transition-all cursor-pointer"
              onClick={() => navigate(`/appointments/${appt.id}`)}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-5 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">
                    {appt.payee.firstName} {appt.payee.lastName}
                  </h2>
                  <p className="text-sm opacity-90">Appointment</p>
                </div>
                <div
                  className="flex gap-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="p-2 rounded-full hover:bg-white/20 transition"
                    onClick={() => handleEdit(appt.id)}
                  >
                    <FaEdit />
                  </button>
                  <button
                    className="p-2 rounded-full hover:bg-white/20 transition"
                    onClick={() => handleDelete(appt.id)}
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
                  <span className="font-medium">Office:</span>{" "}
                  {appt.office.name}, {appt.office.city}, {appt.office.state}
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
          ))}
        </div>
      )}
    </div>
  );
}
