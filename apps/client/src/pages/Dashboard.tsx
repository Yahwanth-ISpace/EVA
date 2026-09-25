import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { getAppointments } from "../redux/actions/appointmentsActions";
import { getVerifications } from "../redux/actions/verificationActions";
import AdminInsuranceTable from "../components/AdminInsuranceTable";
import Navbar from "../components/Navbar";
import type { RootState, AppDispatch } from "../redux/store";
import PatientTabs from "../components/PatientTabs";
import Container from "../components/Container";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();

  const { user } = useSelector((state: RootState) => state.authState);
  const { verifications: verificationData, loading: verificationLoading } =
    useSelector((state: RootState) => state.verificationsState);

  useEffect(() => {
    dispatch(getVerifications());
    dispatch(getAppointments());
  }, [dispatch]);

  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="Dashboard flex flex-col h-screen max-h-screen bg-slate-50/50 overflow-hidden pt-5">
      <Navbar />
      <div className="section-wrapper flex flex-col flex-1 min-h-0 mt-6">
        <div className="flex justify-between items-center px-2 sm:px-4 shrink-0">
          <h1 className="text-2xl font-semibold text-blue-600 tracking-widest">
            Dashboard
          </h1>
        </div>

        <Container className="pb-8 mt-5 flex-1 min-h-0 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
          <PatientTabs />

          {isAdmin ? (
            <section className="shrink-0 border-t border-slate-200 pt-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                Verification records
              </h2>
              <AdminInsuranceTable
                records={verificationData}
                loading={verificationLoading}
              />
            </section>
          ) : null}
        </Container>
      </div>
    </div>
  );
}
