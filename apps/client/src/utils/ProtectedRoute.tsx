import { Navigate } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import type { JSX } from "react";

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <div>Loading...</div>; // or spinner

  return isAuthenticated ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;
