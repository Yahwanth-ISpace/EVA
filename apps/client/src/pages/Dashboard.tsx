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

  // Appointments are used by PatientTabs
  useSelector((state: RootState) => state.appointmentsState);

  // Admin section tab
  const [activeTab, setActiveTab] = useState<AdminTab>("appointments");

  // Verification sorting
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Latest verifications by default
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
        {/* Dashboard Header */}
        <div className="flex shrink-0 items-center justify-between px-2 sm:px-4">
          <h1 className="text-2xl font-semibold tracking-widest text-blue-600">
            Dashboard
          </h1>
        </div>

        <Container
          className="
            mt-5
            flex
            min-h-0
            flex-1
            flex-col
            overflow-y-auto
            pb-12
            custom-scrollbar
          "
        >
          {isAdmin && (
            <section className="shrink-0">
              {/* ========================================= */}
              {/* APPOINTMENTS / VERIFICATIONS TABS         */}
              {/* ========================================= */}

              <div className="border-b border-slate-200">
                <div className="flex items-center gap-8 px-2">
                  {/* Appointments Tab */}
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

                  {/* Verifications Tab */}
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

              {/* ========================================= */}
              {/* APPOINTMENTS TAB                          */}
              {/* ========================================= */}

              {activeTab === "appointments" && (
                <div className="mt-5">
                  <PatientTabs />
                </div>
              )}

              {/* ========================================= */}
              {/* VERIFICATIONS TAB                         */}
              {/* ========================================= */}

              {activeTab === "verifications" && (
                <div className="mt-5">
                  {/* Verification Table */}
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
