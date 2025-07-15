import { useState } from "react";
import { submitVerification } from "../api";
import type { PatientInfo } from "../types/insurance";

const defaultData: PatientInfo = {
  name: "",
  dob: "",
  provider: "",
  memberId: "",
};

export default function PatientForm() {
  const [formData, setFormData] = useState<PatientInfo>(defaultData);
  const [status, setStatus] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Submitting...");
    const result = await submitVerification(formData);
    setStatus(result?.status || "Submitted");
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Insurance Verification</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          name="name"
          type="text"
          value={formData.name}
          onChange={handleChange}
          placeholder="Name"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          name="dob"
          type="date"
          value={formData.dob}
          onChange={handleChange}
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          name="provider"
          type="text"
          value={formData.provider}
          onChange={handleChange}
          placeholder="Provider"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          name="memberId"
          type="text"
          value={formData.memberId}
          onChange={handleChange}
          placeholder="Member ID"
          required
          className="w-full border px-3 py-2 rounded"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Submit
        </button>
        {status && <p className="text-green-700">{status}</p>}
      </form>
    </div>
  );
}
