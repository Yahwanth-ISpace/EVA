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

const parseErrorMessage = (text: string): string => {
  try {
    const parsed = JSON.parse(text) as ErrorResponse & {
      message?: string | string[];
    };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join(", ");
    }
    if (typeof parsed.message === "string" && parsed.message) {
      return parsed.message;
    }
  } catch {
    if (text.length <= 300) return text;
  }
  return "Request failed";
};

const handleResponse = async <T>(res: Response): Promise<T> => {
  const text = await res.text();

  if (!res.ok) {
    const message = text ? parseErrorMessage(text) : "Request failed";

    if (res.status === 401) {
      if (message.toLowerCase().includes("jwt expired")) {
        window.location.href = "/session-expired";
      } else {
        window.location.href = "/login";
      }
    } else if (res.status === 403) {
      window.location.href = "/unauthorized";
    }

    throw new Error(message);
  }

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
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
