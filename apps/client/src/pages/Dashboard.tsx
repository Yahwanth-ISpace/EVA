import { useEffect, useState } from "react";

import { fetchAppointments, fetchVerifications } from "../api";
import AdminInsuranceTable from "../components/AdminInsuranceTable";
import Navbar from "../components/Navbar";
import type { AppointmentRecord, InsuranceRecord } from "../types/insurance";
import { useAuth } from "../utils/AuthContext";
import PatientTabs from "../components/PatientTabs";
import Container from "../components/Container";

export default function Dashboard() {
  const { role } = useAuth();

  const [verificationData, setVerificationData] = useState<InsuranceRecord[]>(
    []
  );
  const [appointmentData, setAppointmentData] = useState<AppointmentRecord[]>(
    []
  );

  useEffect(() => {
    const load = async () => {
      const verifications = await fetchVerifications();
      setVerificationData(verifications);
      const appointments = await fetchAppointments();
      setAppointmentData(appointments);
    };
    load();
  }, []);

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
        <Container className="h-100 pb-8">
          {role === "ADMIN" ? (
            <AdminInsuranceTable records={verificationData} loading={false} />
          ) : (
            <PatientTabs
              verifications={verificationData}
              appointments={appointmentData}
            />
          )}
        </Container>
      </div>
    </div>
  );
}
