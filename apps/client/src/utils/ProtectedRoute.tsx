// src/utils/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import { hasValidSession, isJwtExpired } from "./session";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[]; // optional role restriction
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, token } = useSelector((state: RootState) => state.authState);

  if (!hasValidSession(user, token)) {
    const sessionExpired = Boolean(token && isJwtExpired(token));
    return (
      <Navigate to={sessionExpired ? "/session-expired" : "/login"} replace />
    );
  }

  if (!user || (allowedRoles && !allowedRoles.includes(user.role))) {
    return <Navigate to={user ? "/unauthorized" : "/login"} replace />;
  }

  return <>{children}</>;
}
