import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { getAppointments } from "../redux/actions/appointmentsActions";
import { getVerifications } from "../redux/actions/verificationActions";

import AdminInsuranceTable from "../components/AdminInsuranceTable";
import Navbar from "../components/Navbar";
import type { RootState, AppDispatch } from "../redux/store";
import PatientTabs from "../components/PatientTabs";
import Container from "../components/Container";

type AdminTab = "appointments" | "verifications";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();

  const { user } = useSelector((state: RootState) => state.authState);

  const { verifications: verificationData, loading: verificationLoading } =
    useSelector((state: RootState) => state.verificationsState);

  const { appointments, loading: appointmentLoading } = useSelector(
    (state: RootState) => state.appointmentsState,
  );

  // Admin section tab
  const [activeTab, setActiveTab] = useState<AdminTab>("appointments");

  // Verification sorting
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const sortedRecords = useMemo(() => {
    return [...verificationData].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;

      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [verificationData, sortOrder]);

  useEffect(() => {
    dispatch(getVerifications());
    dispatch(getAppointments());
  }, [dispatch]);

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="Dashboard flex h-screen flex-col overflow-hidden bg-slate-50/50 pt-5">
      <Navbar />

      <div className="section-wrapper mt-6 flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-2 sm:px-4">
          <h1 className="text-2xl font-semibold tracking-widest text-blue-600">
            Dashboard
          </h1>
        </div>

        <Container className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto pb-12 custom-scrollbar">
          <PatientTabs />

          {isAdmin && (
            <section className="mt-8 shrink-0">
              {/* Admin Tabs */}
              <div className="border-b border-slate-200">
                <div className="flex items-center gap-8 px-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("appointments")}
                    className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
                      activeTab === "appointments"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                  >
                    Appointments
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("verifications")}
                    className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
                      activeTab === "verifications"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                  >
                    Verifications
                  </button>
                </div>
              </div>

              {/* Appointments */}
              {activeTab === "appointments" && (
                <div className="mt-4">
                  <div className="mb-3 rounded-lg bg-white px-6 py-3">
                    <h2 className="text-lg font-semibold text-slate-800">
                      Appointments
                    </h2>
                  </div>

                  {/* 
                    Replace this with your appointment table
                    once we use your actual appointment structure.
                  */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                    {appointmentLoading
                      ? "Loading appointments..."
                      : appointments?.length
                        ? `${appointments.length} appointments found.`
                        : "No appointments found."}
                  </div>
                </div>
              )}

              {/* Verifications */}
              {activeTab === "verifications" && (
                <div className="mt-4">
                  {/* Verification controls */}
                  <div className="mb-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-6 py-3">
                    <h2 className="text-lg font-semibold text-slate-800">
                      Verification Records
                    </h2>

                    <button
                      type="button"
                      onClick={() =>
                        setSortOrder((current) =>
                          current === "desc" ? "asc" : "desc",
                        )
                      }
                      className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                    >
                      Sort by Date
                      <span className="ml-2">
                        {sortOrder === "desc" ? "↓ Latest" : "↑ Oldest"}
                      </span>
                    </button>
                  </div>

                  <AdminInsuranceTable
                    records={sortedRecords}
                    loading={verificationLoading}
                  />
                </div>
              )}
            </section>
          )}
        </Container>
      </div>
    </div>
  );
}
