// src/api/axiosInstance.ts
import axios from "axios";
import store from "../redux/store"; // if using Redux
import actions from "../redux/actions";

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
  (error: { response: { status: number } }) => {
    if (error.response?.status === 401) {
      // Auto logout if desired
      store.dispatch(actions.auth.logout());

      // Redirect to session expired page
      window.location.href = "/session-expired";
    }

    // For other errors, just throw them
    return Promise.reject(error);
  }
);

export default axiosInstance;
