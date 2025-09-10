import type { Dispatch } from "redux";
import { api } from "../../utils/api";
import {
  AUTH_LOADING,
  AUTH_SUCCESS,
  AUTH_ERROR,
  LOGIN_SUCCESS,
  LOGOUT,
  type User,
} from "../types/authTypes";
import { persistor } from "../store";

interface LoginResponse {
  token: string;
  user: User;
}

// redux/actions/auth.ts
export const login =
  (email: string, password: string) => async (dispatch: Dispatch) => {
    dispatch({ type: AUTH_LOADING });
    try {
      const res = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });

      localStorage.setItem("token", res.token);
      dispatch({ type: LOGIN_SUCCESS, payload: res });
      dispatch({ type: AUTH_SUCCESS, payload: "Login successful" });

      return res;
    } catch (err: any) {
      dispatch({ type: AUTH_ERROR, payload: err.message });
      throw err;
    }
  };

export const register =
  (data: Partial<User> & { password: string }) =>
  async (dispatch: Dispatch) => {
    dispatch({ type: AUTH_LOADING });
    try {
      await api.post("/auth/register", data);
      dispatch({ type: AUTH_SUCCESS, payload: "Registration successful" });
    } catch (err: any) {
      dispatch({ type: AUTH_ERROR, payload: err.message });
    }
  };

export const logout = () => (dispatch: Dispatch) => {
  window.location.href = "/login";

  localStorage.removeItem("token");
  localStorage.removeItem("user");
  dispatch({ type: LOGOUT });
  persistor.purge();
};
