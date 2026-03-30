// src/utils/api.ts
import store from "../redux/store";
import { withNgrokBypass } from "./ngrokHeaders";

interface ErrorResponse {
  message: string;
}

const resolveBase = (baseUrl?: string) =>
  baseUrl || import.meta.env.VITE_BACKEND_URL || "";

const getAuthHeaders = (baseUrl?: string) => {
  const { token } = store.getState().authState;
  return withNgrokBypass(resolveBase(baseUrl), {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
};

const handleResponse = async <T>(res: Response): Promise<T> => {
  const text = await res.text();

  if (!res.ok) {
    try {
      const error: ErrorResponse = text ? JSON.parse(text) : {};

      if (res.status === 401) {
        if (error.message?.toLowerCase().includes("jwt expired")) {
          window.location.href = "/session-expired";
        } else {
          window.location.href = "/login";
        }
      } else if (res.status === 403) {
        window.location.href = "/unauthorized";
      }

      throw new Error(error.message || "Incorrect Credentials");
    } catch {
      throw new Error("API Error");
    }
  }

  return text ? JSON.parse(text) : ({} as T);
};

export const api = {
  get: async <T>(url: string, baseUrl?: string): Promise<T> => {
    const base = resolveBase(baseUrl);
    const res = await fetch(`${base}${url}`, {
      headers: getAuthHeaders(baseUrl),
    });
    return handleResponse<T>(res);
  },

  post: async <TResponse, TRequest = unknown>(
    url: string,
    body: TRequest,
    baseUrl?: string
  ): Promise<TResponse> => {
    const base = resolveBase(baseUrl);
    const res = await fetch(`${base}${url}`, {
      method: "POST",
      headers: getAuthHeaders(baseUrl),
      body: JSON.stringify(body),
    });
    return handleResponse<TResponse>(res);
  },

  put: async <TResponse, TRequest = unknown>(
    url: string,
    body: TRequest,
    baseUrl?: string
  ): Promise<TResponse> => {
    const base = resolveBase(baseUrl);
    const res = await fetch(`${base}${url}`, {
      method: "PUT",
      headers: getAuthHeaders(baseUrl),
      body: JSON.stringify(body),
    });
    return handleResponse<TResponse>(res);
  },

  delete: async <T>(url: string, baseUrl?: string): Promise<T> => {
    const base = resolveBase(baseUrl);
    const res = await fetch(`${base}${url}`, {
      method: "DELETE",
      headers: getAuthHeaders(baseUrl),
    });
    return handleResponse<T>(res);
  },
};
