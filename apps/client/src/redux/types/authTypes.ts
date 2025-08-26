// Redux-style constants (if you’re using them in frontend state)
export const AUTH_LOADING = "AUTH_LOADING";
export const AUTH_SUCCESS = "AUTH_SUCCESS";
export const AUTH_ERROR = "AUTH_ERROR";
export const LOGIN_SUCCESS = "LOGIN_SUCCESS";
export const LOGOUT = "LOGOUT";

// Roles available in your system
export type UserRole = "ADMIN" | "PAYEE";

// Core User interface returned from Prisma
export interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  dob: Date | null;
  role: UserRole;
  payeeId?: string; // present only if role === PAYEE
}

// Payload returned after successful registration
export interface RegisterResponse {
  message: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    dob: Date | null;
    role: UserRole;
    payeeId?: string;
  };
}

// Payload returned after successful login
export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    dob: Date | null;
    role: UserRole;
    payeeId?: string;
    payee?: {
      id: string;
      firstName: string;
      lastName: string;
      dob: Date | null;
    };
  };
}

// Frontend AuthState (for Redux or Context)
export interface AuthState {
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  user: User | null;
  token: string | null;
}
