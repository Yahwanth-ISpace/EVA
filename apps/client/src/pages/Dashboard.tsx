import { useEffect, useState } from "react";
import { fetchVerifications } from "../api";
import type { CoverageData } from "../types/insurance";
import CoverageCard from "../components/CoverageCard";

export default function Dashboard() {
  const [data, setData] = useState<CoverageData[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await fetchVerifications();
      setData(res);
    };
    load();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Verified Patients</h2>
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
