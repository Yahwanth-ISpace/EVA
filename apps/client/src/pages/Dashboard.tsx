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
    <div className="Dashboard">
      {/* Header */}
      <Navbar />
      <div className="section-wrapper flex flex-col gap-y-3 mt-5">
        <div className="flex justify-between items-center px-6">
          <h2 className="text-2xl font-mono text-blue-700 tracking-[0.2em]">
            Dashboard
          </h2>
        </div>

        {/* Body */}
        <Container className="pb-8">
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
