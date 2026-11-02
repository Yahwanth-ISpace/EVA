import type { Dispatch } from "redux";
import { api } from "../../utils/api";
import { setCsrfToken, tryRefresh } from "../../utils/authSession";
import {
  AUTH_LOADING,
  AUTH_SUCCESS,
  AUTH_ERROR,
  LOGIN_SUCCESS,
  LOGOUT,
  type User,
} from "../types/authTypes";
import { persistor } from "../store";
import { redirectToLogin } from "../../utils/session";

export interface LoginResult {
  user?: User;
  csrfToken?: string;
}

function acceptSession(dispatch: Dispatch, res: LoginResult) {
  if (res.csrfToken) setCsrfToken(res.csrfToken);
  dispatch({ type: LOGIN_SUCCESS, payload: res });
  dispatch({ type: AUTH_SUCCESS, payload: "Login successful" });
}

export const login =
  (email: string, password: string, rememberMe = false) =>
  async (dispatch: Dispatch) => {
    dispatch({ type: AUTH_LOADING });
    try {
      const res = await api.post<LoginResult>("/auth/login", {
        email,
        password,
        rememberMe,
      });

      acceptSession(dispatch, res);
      return res;
    } catch (err: any) {
      dispatch({ type: AUTH_ERROR, payload: err.message });
      throw err;
    }
  };

export const restoreSession = () => async (dispatch: Dispatch) => {
  dispatch({ type: AUTH_LOADING });
  const load = async () => {
    const session = await api.get<LoginResult>("/auth/session", undefined, {
      redirectOn401: false,
    });
    if (!session.user) throw new Error("No session");
    acceptSession(dispatch, session);
  };
  try {
    await load();
    return;
  } catch {
    // The access cookie may have expired while the refresh cookie is still valid.
  }
  try {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      dispatch({ type: LOGOUT });
      return;
    }
    await load();
  } catch {
    dispatch({ type: LOGOUT });
  }
};

export const register =
  (data: { fullName: string; email: string; password: string }) =>
  async (dispatch: Dispatch) => {
    dispatch({ type: AUTH_LOADING });
    try {
      const res = await api.post("/auth/register", {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
      });
      dispatch({ type: AUTH_SUCCESS, payload: "Registration successful" });
      return res;
    } catch (err: any) {
      dispatch({ type: AUTH_ERROR, payload: err.message });
      return null;
    }
  };

export const logout = () => async (dispatch: Dispatch) => {
  try {
    await api.post("/auth/logout", {}, undefined, { redirectOn401: false });
  } catch {
    // The cookies are cleared locally even if the server is unreachable.
  }
  dispatch({ type: LOGOUT });
  persistor.purge();
  redirectToLogin();
};
