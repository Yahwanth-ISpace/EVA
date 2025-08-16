// apps/client/src/api/index.ts
import type {
  AppointmentRecord,
  createAppointmentPayload,
  InsuranceRecord,
  Office,
  Provider,
} from "../types/insurance";

const BASE_URL = "https://claimbot-vqhl.onrender.com";
// const BASE_URL = "http://localhost:3000";

const token = localStorage.getItem("token");

export async function submitVerification(
  data: AppointmentRecord
): Promise<{ status: string; taskId?: string }> {
  const res = await fetch(`${BASE_URL}/verify-insurance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function createAppointment(
  data: createAppointmentPayload
): Promise<{ status: string; taskId?: string }> {
  const res = await fetch(`${BASE_URL}/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchVerifications(): Promise<InsuranceRecord[]> {
  const res = await fetchWithAuth(`${BASE_URL}/verifications`);
  return res.json();
}

export async function fetchProviders(): Promise<Provider[]> {
  const res = await fetchWithAuth(`${BASE_URL}/providers`);
  return res.json();
}

export async function fetchOffices(providerId: string): Promise<Office[]> {
  const res = await fetchWithAuth(`${BASE_URL}/offices/provider/${providerId}`);
  return res.json();
}

export async function fetchAppointments(): Promise<AppointmentRecord[]> {
  const res = await fetchWithAuth(`${BASE_URL}/appointments`);
  return res.json();
}

export async function fetchRecordById(id: string): Promise<InsuranceRecord> {
  const res = await fetchWithAuth(`${BASE_URL}/verifications/${id}`);
  if (!res.ok) {
    throw new Error("Record not found");
  }
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
