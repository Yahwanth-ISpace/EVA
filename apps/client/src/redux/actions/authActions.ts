import type { Dispatch } from "redux";
import { api } from "../../utils/api";
import { setCsrfToken, tryRefresh } from "../../utils/authSession";
import { postEncrypted, verifyProfile } from "../../utils/credentialCrypto";
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
  profileToken?: string | null;
  csrfToken?: string;
  user?: User;
}

async function acceptSession(dispatch: Dispatch, res: LoginResult) {
  if (!res.profileToken) throw new Error("Session could not be verified");
  const user = await verifyProfile(res.profileToken);
  if (res.csrfToken) setCsrfToken(res.csrfToken);
  dispatch({ type: LOGIN_SUCCESS, payload: { user } });
  dispatch({ type: AUTH_SUCCESS, payload: "Login successful" });
  return user;
}

export const login =
  (email: string, password: string, rememberMe = false) =>
  async (dispatch: Dispatch) => {
    dispatch({ type: AUTH_LOADING });
    try {
      const res = await postEncrypted<LoginResult>(
        "/auth/login",
        { email, password },
        { rememberMe },
      );

      const user = await acceptSession(dispatch, res);
      return { user };
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
    if (!session.profileToken) throw new Error("No session");
    await acceptSession(dispatch, session);
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
      const res = await postEncrypted<{ message: string }>("/auth/register", {
        fullName: data.fullName,
        email: data.email,
        password: data.password,
      });
      dispatch({ type: AUTH_SUCCESS, payload: res.message });
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
