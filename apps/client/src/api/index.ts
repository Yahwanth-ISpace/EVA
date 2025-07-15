import type { PatientInfo, CoverageData } from "../types/insurance";

const BASE_URL = "http://localhost:5000/api";

export async function submitVerification(
  data: PatientInfo
): Promise<{ status: string; taskId?: string }> {
  const res = await fetch(`${BASE_URL}/verify-insurance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchVerifications(): Promise<CoverageData[]> {
  const res = await fetch(`${BASE_URL}/verifications`);
  return res.json();
}
