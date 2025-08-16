// src/pages/InsuranceDetails.tsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import type { InsuranceRecord } from "../types/insurance";
import { fetchRecordById } from "../api";

export default function InsuranceDetails() {
  const { id } = useParams();
  const [record, setRecord] = useState<InsuranceRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchRecordById(id).then((res) => {
      setRecord(res);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <p className="p-6">Loading...</p>;
  if (!record) return <p className="p-6">Record not found</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-4">
        {record.payee.firstName} {record.payee.lastName}
      </h1>
      <p>
        <strong>DOB:</strong> {new Date(record.payee.dob).toLocaleDateString()}
      </p>
      <p>
        <strong>SSN:</strong> {record.payee.ssn}
      </p>
      <p>
        <strong>Coverage:</strong> {record.coverage}
      </p>
      <p>
        <strong>Deductible:</strong> {record.deductible}
      </p>
      <p>
        <strong>Copay:</strong> {record.copay}
      </p>
      <p>
        <strong>Valid Till:</strong> {record.validity}
      </p>
      <p className="mt-4 text-gray-700">
        <strong>Transcript:</strong>
        <br />
        {record.transcript}
      </p>
    </div>
  );
}
