// src/redux/reducers/authReducer.ts
import {
  AUTH_LOADING,
  AUTH_SUCCESS,
  AUTH_ERROR,
  LOGIN_SUCCESS,
  LOGOUT,
  type AuthState,
} from "../types/authTypes";
import { clearAuthStorage, loggedOutAuthState } from "../../utils/session";
import { sanitizeStoredUser } from "../../utils/sanitizeUser";

interface Action {
  type: string;
  payload?: any;
}

clearAuthStorage();

const initialState: AuthState = { ...loggedOutAuthState(), loading: true };

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
        ...loggedOutAuthState(),
        error: action.payload,
      };

    case LOGIN_SUCCESS: {
      const user = sanitizeStoredUser(action.payload.user);
      return {
        ...state,
        loading: false,
        user,
        token: null,
        isAuthenticated: true,
        role: action.payload.user.role,
        error: null,
      };
    }

    case LOGOUT:
      clearAuthStorage();
      return loggedOutAuthState();

    default:
      return state;
  }
};
