// src/utils/api.ts
import store from "../redux/store";
import { LOGOUT } from "../redux/types/authTypes";
import { csrfHeaders, tryRefresh } from "./authSession";
import { withNgrokBypass } from "./ngrokHeaders";
import { isPublicAuthRequest, redirectToSessionExpired } from "./session";

interface ErrorResponse {
  message: string;
}

type RequestOptions = {
  redirectOn401?: boolean;
};

const resolveBase = (baseUrl?: string) =>
  baseUrl || import.meta.env.VITE_BACKEND_URL || "";

const getAuthHeaders = (baseUrl?: string) =>
  withNgrokBypass(resolveBase(baseUrl), {
    "Content-Type": "application/json",
    ...csrfHeaders(),
  });

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

const handleResponse = async <T>(
  res: Response,
  url: string,
  retry: () => Promise<Response>,
  options?: RequestOptions,
): Promise<T> => {
  if (
    res.status === 401 &&
    options?.redirectOn401 !== false &&
    !isPublicAuthRequest(url)
  ) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return handleResponse<T>(await retry(), url, retry, {
        redirectOn401: false,
      });
    }
    store.dispatch({ type: LOGOUT });
    redirectToSessionExpired();
    throw new Error("Session expired");
  }

  const text = await res.text();

  if (!res.ok) {
    const message = text ? parseErrorMessage(text) : "Request failed";

    if (
      res.status === 401 &&
      options?.redirectOn401 !== false &&
      !isPublicAuthRequest(url)
    ) {
      store.dispatch({ type: LOGOUT });
      redirectToSessionExpired();
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
  get: async <T>(
    url: string,
    baseUrl?: string,
    options?: RequestOptions,
  ): Promise<T> => {
    const base = resolveBase(baseUrl);
    const send = () =>
      fetch(`${base}${url}`, {
        credentials: "include",
        headers: getAuthHeaders(baseUrl),
      });
    return handleResponse<T>(await send(), url, send, options);
  },

  post: async <TResponse, TRequest = unknown>(
    url: string,
    body: TRequest,
    baseUrl?: string,
    options?: RequestOptions,
  ): Promise<TResponse> => {
    const base = resolveBase(baseUrl);
    const send = () =>
      fetch(`${base}${url}`, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders(baseUrl),
        body: JSON.stringify(body),
      });
    return handleResponse<TResponse>(await send(), url, send, options);
  },

  put: async <TResponse, TRequest = unknown>(
    url: string,
    body: TRequest,
    baseUrl?: string,
    options?: RequestOptions,
  ): Promise<TResponse> => {
    const base = resolveBase(baseUrl);
    const send = () =>
      fetch(`${base}${url}`, {
        method: "PUT",
        credentials: "include",
        headers: getAuthHeaders(baseUrl),
        body: JSON.stringify(body),
      });
    return handleResponse<TResponse>(await send(), url, send, options);
  },

  delete: async <T>(
    url: string,
    baseUrl?: string,
    options?: RequestOptions,
  ): Promise<T> => {
    const base = resolveBase(baseUrl);
    const send = () =>
      fetch(`${base}${url}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(baseUrl),
      });
    return handleResponse<T>(await send(), url, send, options);
  },
};
