import type { AppState } from "../reducers";

export const selectAuthLoading = (state: AppState) => state.authState.loading;
export const selectAuthError = (state: AppState) => state.authState.error;
export const selectAuthUser = (state: AppState) => state.authState.user;
export const selectAuthToken = (state: AppState) => state.authState.token;
export const isAuthenticated = (state: AppState) =>
  Boolean(state.authState.token);
export const isAdmin = (state: AppState) =>
  state.authState.user?.role === "ADMIN";
export const isPayee = (state: AppState) =>
  state.authState.user?.role === "PAYEE";
