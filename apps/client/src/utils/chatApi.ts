// src/utils/chatApi.ts
import store from "../redux/store";
import { withNgrokBypass } from "./ngrokHeaders";

const CHAT_BASE_URL = import.meta.env.VITE_CHAT_BACKEND_URL;

const getAuthHeaders = () => {
  const { token } = store.getState().authState;
  return withNgrokBypass(CHAT_BASE_URL, {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
};

const handleResponse = async <T>(res: Response): Promise<T> => {
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "API Error");
  }
  return text ? JSON.parse(text) : ({} as T);
};

export const chatApi = {
  get: <T>(url: string) => fetch(`${CHAT_BASE_URL}${url}`, { headers: getAuthHeaders() }).then(handleResponse),
  post: <TResponse, TRequest = unknown>(url: string, body: TRequest) =>
    fetch(`${CHAT_BASE_URL}${url}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    }).then(handleResponse<TResponse>),
};
