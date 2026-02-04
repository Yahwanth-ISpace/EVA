import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { getAppointments } from "../redux/actions/appointmentsActions";
import { getVerifications } from "../redux/actions/verificationActions";
import AdminInsuranceTable from "../components/AdminInsuranceTable";
import Navbar from "../components/Navbar";
import type { RootState, AppDispatch } from "../redux/store";
import PatientTabs from "../components/PatientTabs";
import Container from "../components/Container";
import { Role } from "../components/RoleWrapper";

export default function Dashboard() {
  const dispatch = useDispatch<AppDispatch>();

  const { verifications: verificationData, loading: verificationLoading } =
    useSelector((state: RootState) => state.verificationsState);

  useEffect(() => {
    dispatch(getVerifications());
    dispatch(getAppointments());
  }, [dispatch]);

  return (
    <div className="Dashboard flex flex-col h-screen max-h-screen bg-slate-50/50 overflow-hidden pt-5">
      <Navbar />
      <div className="section-wrapper flex flex-col flex-1 min-h-0 mt-6">
        <div className="flex justify-between items-center px-2 sm:px-4 shrink-0">
          <h1 className="text-2xl font-semibold text-blue-600 tracking-widest">
            Dashboard
          </h1>
        </div>

        <Container className="pb-8 mt-5 flex-1 min-h-0">
          <Role role="ADMIN">
            <AdminInsuranceTable
              records={verificationData}
              loading={verificationLoading}
            />
          </Role>

          <Role role="PAYEE">
            <PatientTabs />
          </Role>
        </Container>
      </div>
    </div>
  );
}
