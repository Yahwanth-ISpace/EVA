// src/hooks/useAuth.ts
import { type TypedUseSelectorHook, useSelector } from "react-redux";
import type { RootState } from "../redux/store";

import { useDispatch } from "react-redux";
import type { ThunkDispatch } from "redux-thunk";
import type { AnyAction } from "redux";

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export const useAppDispatch = () =>
  useDispatch<ThunkDispatch<RootState, any, AnyAction>>();

export const useAuth = () => {
  const { token, user, loading, error } = useSelector(
    (state: RootState) => state.authState
  );

  const isAuthenticated = !!token;
  const isAdmin = user?.role === "ADMIN";
  const isPayee = user?.role === "PAYEE";

  return {
    token,
    user,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    isPayee,
  };
};
