// src/utils/api.ts
import store from "../redux/store";

const BASE_URL = import.meta.env.VITE_BACKEND_URL;

interface ErrorResponse {
  message: string;
}

const getAuthHeaders = () => {
  const { token } = store.getState().authState;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const handleResponse = async <T>(res: Response): Promise<T> => {
  const text = await res.text();

  if (!res.ok) {
    try {
      const error: ErrorResponse = text ? JSON.parse(text) : {};

      if (res.status === 401) {
        // Determine if it's a session expiry or just not logged in
        if (error.message?.toLowerCase().includes("jwt expired")) {
          window.location.href = "/session-expired";
        } else {
          window.location.href = "/login"; // or just throw
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
  get: async <T>(url: string): Promise<T> => {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<T>(res);
  },

  post: async <TResponse, TRequest = unknown>(
    url: string,
    body: TRequest
  ): Promise<TResponse> => {
    const res = await fetch(`${BASE_URL}${url}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<TResponse>(res);
  },

  put: async <TResponse, TRequest = unknown>(
    url: string,
    body: TRequest
  ): Promise<TResponse> => {
    const res = await fetch(`${BASE_URL}${url}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<TResponse>(res);
  },

  delete: async <T>(url: string): Promise<T> => {
    const res = await fetch(`${BASE_URL}${url}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return handleResponse<T>(res);
  },
};
