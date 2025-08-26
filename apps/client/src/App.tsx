// src/App.tsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useSelector } from "react-redux";

import Dashboard from "./pages/Dashboard";
import ErrorPage from "./pages/ErrorPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import SessionExpiredPage from "./pages/SessionExpired";
import AppointmentForm from "./pages/AppointmentForm";
import InsuranceDetails from "./pages/InsuranceDetails";

import ProtectedRoute from "./utils/ProtectedRoute";
import Layout from "./components/Layout";
import type { RootState } from "./redux/store";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ChatModal from "./components/ChatModal";
import ChatWindow from "./components/ChatWindow";
import ChatButton from "./components/ChatButton";
import { useState } from "react";

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
                <ProtectedRoute allowedRoles={["ADMIN", "PAYEE"]}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/appointment-form"
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "PAYEE"]}>
                  <AppointmentForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/insurance/:id"
              element={
                <ProtectedRoute allowedRoles={["ADMIN", "PAYEE"]}>
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
