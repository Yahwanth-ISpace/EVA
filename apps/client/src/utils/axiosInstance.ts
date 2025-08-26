// src/api/axiosInstance.ts
import axios from "axios";
import store from "../redux/store"; // if using Redux
import actions from "../redux/actions";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  withCredentials: true,
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
