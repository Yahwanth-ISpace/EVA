// src/api/axiosInstance.ts
import axios from "axios";
import store from "../redux/store";
import { LOGOUT } from "../redux/types/authTypes";
import { isPublicAuthRequest, redirectToSessionExpired } from "./session";

const backendBase = import.meta.env.VITE_BACKEND_URL || "";

const axiosInstance = axios.create({
  baseURL: backendBase,
  withCredentials: true,
  headers:
    backendBase.toLowerCase().includes("ngrok")
      ? { "ngrok-skip-browser-warning": "true" }
      : undefined,
});

axiosInstance.interceptors.response.use(
  (response: any) => response,
  (error: { response?: { status: number }; config?: { url?: string } }) => {
    const url = error.config?.url ?? "";
    if (error.response?.status === 401 && !isPublicAuthRequest(url)) {
      store.dispatch({ type: LOGOUT });
      redirectToSessionExpired();
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
