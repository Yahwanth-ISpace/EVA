// apps/client/src/api/index.ts
import type { PatientInfo, CoverageData } from "../types/insurance";

const BASE_URL = "https://claimbot-vqhl.onrender.com";

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

// Add these new functions for authentication
export async function login(credentials: { email: string; password: string }) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) {
    throw new Error("Login failed");
  }
  return res.json();
}

export async function register(userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    throw new Error("Registration failed");
  }
  return res.json();
}

// Add auth header for authenticated requests
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  return fetch(url, { ...options, headers });
}
