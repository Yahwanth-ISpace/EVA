// src/redux/reducers/authReducer.ts
import {
  AUTH_LOADING,
  AUTH_SUCCESS,
  AUTH_ERROR,
  LOGIN_SUCCESS,
  LOGOUT,
  type AuthState,
} from "../types/authTypes";

interface Action {
  type: string;
  payload?: any;
}

const userFromStorage = localStorage.getItem("user");
const tokenFromStorage = localStorage.getItem("token");

const initialState: AuthState = {
  loading: false,
  error: null,
  user: userFromStorage ? JSON.parse(userFromStorage) : null,
  token: tokenFromStorage || null,
  isAuthenticated: !!tokenFromStorage,
  role: userFromStorage ? JSON.parse(userFromStorage).role : null,
};

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
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      return {
        ...initialState,
        isAuthenticated: false,
        role: null,
      };

    default:
      return state;
  }
};
