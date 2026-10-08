// src/redux/reducers/authReducer.ts
import {
  AUTH_LOADING,
  AUTH_SUCCESS,
  AUTH_ERROR,
  LOGIN_SUCCESS,
  LOGOUT,
  type AuthState,
} from "../types/authTypes";
import {
  clearAuthStorage,
  isJwtExpired,
  loggedOutAuthState,
} from "../../utils/session";

interface Action {
  type: string;
  payload?: any;
}

const readStoredSession = (): AuthState => {
  const token = localStorage.getItem("token");
  const userRaw = localStorage.getItem("user");

  if (!token || !userRaw || isJwtExpired(token)) {
    if (token || userRaw) clearAuthStorage();
    return loggedOutAuthState();
  }

  try {
    const user = JSON.parse(userRaw);
    return {
      ...loggedOutAuthState(),
      user,
      token,
      isAuthenticated: true,
      role: user.role ?? null,
    };
  } catch {
    clearAuthStorage();
    return loggedOutAuthState();
  }
};

const initialState: AuthState = readStoredSession();

export const authReducer = (
  state = initialState,
  action: Action
): AuthState => {
  switch (action.type) {
    case AUTH_LOADING:
      return { ...state, loading: true, error: null };

    case AUTH_SUCCESS:
      return { ...state, loading: false, error: null };

    case AUTH_ERROR:
      return {
        ...state,
        loading: false,
        user: null,
        token: null,
        isAuthenticated: false,
        role: null,
        error: action.payload,
      };

    case LOGIN_SUCCESS:
      localStorage.setItem("user", JSON.stringify(action.payload.user));
      localStorage.setItem("token", action.payload.access_token);
      return {
        ...state,
        loading: false,
        user: action.payload.user,
        token: action.payload.access_token,
        isAuthenticated: true,
        role: action.payload.user.role,
        error: null,
      };

    case LOGOUT:
      clearAuthStorage();
      return loggedOutAuthState();

    default:
      return state;
  }
};
