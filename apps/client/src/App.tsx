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
import SessionExpiredPage from "./pages/SessionExpired";
import UnauthorizedPage from "./pages/UnauthorizedPage";

import Layout from "./components/Layout";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import type { RootState } from "./redux/store";
import ProtectedRoute from "./utils/ProtectedRoute";

function App() {
  const { user, loading } = useSelector((state: RootState) => state.authState);
  

  if (loading) return <div>Loading...</div>;

  return (
    <Router>
      <div className="main-container">
        <Routes>
          {/* Public routes without Layout */}
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" /> : <Login />}
          />
          <Route
            path="/signup"
            element={user ? <Navigate to="/dashboard" /> : <SignUp />}
          />

          {/* Protected routes with Layout */}
          <Route element={<Layout />}>
            <Route
              path="/"
              element={<Navigate to={user ? "/dashboard" : "/login"} />}
            />
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

            {/* Error/utility pages */}
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route path="/session-expired" element={<SessionExpiredPage />} />
            <Route path="/error" element={<ErrorPage />} />
          </Route>
        </Routes>
      </div>
    </Router>
  );
}

export default App;
