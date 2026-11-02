// src/utils/chatApi.ts
import { csrfHeaders } from "./authSession";
import { withNgrokBypass } from "./ngrokHeaders";

const CHAT_BASE_URL =
  import.meta.env.VITE_CHAT_BACKEND_URL || import.meta.env.VITE_BACKEND_URL || "";

const getAuthHeaders = () =>
  withNgrokBypass(CHAT_BASE_URL, {
    "Content-Type": "application/json",
    ...csrfHeaders(),
  });

const handleResponse = async <T>(res: Response): Promise<T> => {
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "API Error");
  }
  return text ? JSON.parse(text) : ({} as T);
};

export const chatApi = {
  get: (url: string) =>
    fetch(`${CHAT_BASE_URL}${url}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    }).then(handleResponse),
  post: <TResponse, TRequest = unknown>(url: string, body: TRequest) =>
    fetch(`${CHAT_BASE_URL}${url}`, {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    }).then(handleResponse<TResponse>),
};
