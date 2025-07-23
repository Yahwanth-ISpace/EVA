// apps/client/src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { fetchVerifications } from "../api";
import type { CoverageData } from "../types/insurance";
import CoverageCard from "../components/CoverageCard";

export default function Dashboard() {
  const [data, setData] = useState<CoverageData[]>([]);
  const [userRole, setUserRole] = useState("");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    window.location.href = "/login";
  };

  useEffect(() => {
    const load = async () => {
      const res = await fetchVerifications();
      setData(res);
      // Get user role from token or local storage
      const role = localStorage.getItem("userRole") || "";
      setUserRole(role);
    };
    load();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Verified Patients</h2>
        <div className="flex items-center space-x-4">
          {userRole === "ADMIN" && (
            <a 
              href="/patient-form" 
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Add Patient
            </a>
          )}
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </div>
      <div className="">
        {data.length === 0 ? (
          <p>No verifications yet.</p>
        ) : (
          data.map((item) => <CoverageCard key={item.memberId} data={item} />)
        )}
      </div>
    </div>
  );
}