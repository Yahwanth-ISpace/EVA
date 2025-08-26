// src/pages/InsuranceDetails.tsx
import { useParams } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState, AppDispatch } from "../redux/store";
import { getVerificationById } from "../redux/actions/verificationActions";

export default function InsuranceDetails() {
  const { id } = useParams();
  const dispatch = useDispatch<AppDispatch>();

  // ✅ use the correct slice name from store (verificationsState)
  const { verification, loading, error } = useSelector(
    (state: RootState) => state.verificationsState
  );

  useEffect(() => {
    if (id) {
      dispatch(getVerificationById(id));
    }
  }, [id, dispatch]);

  if (loading) return <p className="p-6">Loading...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!verification) return <p className="p-6">Record not found</p>;

  return (
    <div className="p-6 max-w-3xl mx-auto bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-4">
        {verification.payee.firstName} {verification.payee.lastName}
      </h1>
      <p>
        <strong>DOB:</strong>{" "}
        {verification.payee.dob
          ? new Date(verification.payee.dob).toLocaleDateString()
          : "N/A"}
      </p>
      <p>
        <strong>SSN:</strong> {verification.payee.ssn || "N/A"}
      </p>
      <p>
        <strong>Coverage:</strong> {verification.coverage || "N/A"}
      </p>
      <p>
        <strong>Deductible:</strong> {verification.deductible || "N/A"}
      </p>
      <p>
        <strong>Copay:</strong> {verification.copay || "N/A"}
      </p>
      <p>
        <strong>Valid Till:</strong> {verification.validity || "N/A"}
      </p>
      <p className="mt-4 text-gray-700">
        <strong>Transcript:</strong>
        <br />
        {verification.transcript || "No transcript available"}
      </p>
    </div>
  );
}
