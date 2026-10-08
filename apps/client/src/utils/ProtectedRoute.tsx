// src/utils/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import { hasValidSession } from "./session";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[]; // optional role restriction
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, token } = useSelector((state: RootState) => state.authState);

  if (!user || !hasValidSession(user, token)) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
