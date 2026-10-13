// src/App.tsx
import { useSelector } from "react-redux";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";

import AppointmentForm from "./pages/AppointmentForm";
import AppointmentDetail from "./pages/AppointmentDetail";
import Dashboard from "./pages/Dashboard";
import ErrorPage from "./pages/ErrorPage";
import InsuranceDetails from "./pages/InsuranceDetails";
import NotFoundPage from "./pages/NotFoundPage";
import SessionExpiredPage from "./pages/SessionExpired";
import UnauthorizedPage from "./pages/UnauthorizedPage";

import Layout from "./components/Layout";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import type { RootState } from "./redux/store";
import ProtectedRoute from "./utils/ProtectedRoute";
import { hasValidSession } from "./utils/session";

function App() {
  const { user, token, loading } = useSelector(
    (state: RootState) => state.authState
  );
  const sessionValid = hasValidSession(user, token);
  

  if (loading) return <div>Loading...</div>;

  return (
    <Router>
      <div className="main-container">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={sessionValid ? "/dashboard" : "/login"} replace />}
          />

          {/* Signed-out auth screens */}
          <Route
            path="/login"
            element={sessionValid ? <Navigate to="/dashboard" replace /> : <Login />}
          />
          <Route
            path="/signup"
            element={sessionValid ? <Navigate to="/dashboard" replace /> : <SignUp />}
          />
          <Route
            path="/session-expired"
            element={
              sessionValid ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <SessionExpiredPage />
              )
            }
          />

          {/* Standalone status screens */}
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/error" element={<ErrorPage />} />

          {/* Signed-in app screens */}
          <Route element={<Layout />}>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "OPERATOR"]}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/appointment-form"
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "OPERATOR"]}>
                  <AppointmentForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/appointments/:id"
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "OPERATOR"]}>
                  <AppointmentDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/insurance/:id"
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "OPERATOR"]}>
                  <InsuranceDetails />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
