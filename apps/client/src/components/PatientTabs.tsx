import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import {
  deleteAppointment,
  getAppointments,
} from "../redux/actions/appointmentsActions";
import {
  deleteVerification,
  getVerifications,
} from "../redux/actions/verificationActions";
import type { AppDispatch, RootState } from "../redux/store";
import AppointmentCard from "./AppointementCard";
import VerificationCard from "./VerificationCard";

const SkeletonCard = () => (
  <div className="w-[373px] h-[260px] max-w-sm shadow-lg animate-pulse rounded-2xl">
    <div className="bg-gray-300 h-[92px] w-full rounded-t-2xl"></div>
    <div className="bg-white flex-1 p-5 space-y-4">
      <div className="h-4 bg-gray-300 rounded w-3/4"></div>
      <div className="h-4 bg-gray-300 rounded w-1/2"></div>
      <div className="h-4 bg-gray-300 rounded w-2/3"></div>
      <div className="h-4 bg-gray-300 rounded w-1/3"></div>
    </div>
  </div>
);

export default function PatientTabs() {
  const [activeTab, setActiveTab] = useState<"appointments" | "verifications">(
    "appointments"
  );
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  // Select state from Redux
  const { appointments, loading: loadingAppointments } = useSelector(
    (state: RootState) => state.appointmentsState
  );
  const { verifications, loading: loadingVerifications } = useSelector(
    (state: RootState) => state.verificationsState
  );

  // Handlers
  const handleEdit = (id: string, type: "appointment" | "verification") => {
    if (type === "verification") {
      navigate(`/insurance/${id}/edit`);
    } else {
      navigate(`/appointments/${id}/edit`);
    }
  };

  const handleDelete = (id: string, type: "appointment" | "verification") => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this record?"
    );
    if (!confirmed) {
      return;
    }

    if (type === "verification") {
      dispatch(deleteVerification(id));
      dispatch(getVerifications());
    } else {
      dispatch(deleteAppointment(id));
      dispatch(getAppointments());
    }
  };

  const loading =
    activeTab === "appointments" ? loadingAppointments : loadingVerifications;

  const data = activeTab === "appointments" ? appointments : verifications;

  return (
    <div className="flex flex-col gap-3 relative">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 ">
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

      {/* Content */}
      <div className="content-wrapper">
        {loading ? (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full h-[500px] overflow-x-hidden overflow-y-auto pr-5 custom-scrollbar py-3 px-1">
            {Array.from({ length: 6 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-center text-gray-500 mt-10">
            {activeTab === "appointments"
              ? "No appointments found."
              : "No verifications found."}
          </p>
        ) : (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-h-[500px] flex-1 overflow-x-hidden overflow-y-auto pr-2 custom-scrollbar py-3 px-1">
            {activeTab === "appointments"
              ? appointments.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appt={appt}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                  />
                ))
              : verifications.map((ver) => (
                  <VerificationCard
                    key={ver.id}
                    record={ver}
                    handleEdit={handleEdit}
                    handleDelete={handleDelete}
                  />
                ))}
          </div>
        )}
      </div>
    </div>
  );
}
