import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import Calendar from "./pages/Calendar";
import WorkingHours from "./pages/WorkingHours";
import Clients from "./pages/Clients";
import SessionTypes from "./pages/SessionTypes";
import FormQuestions from "./pages/FormQuestions";
import PaymentSettings from "./pages/PaymentSettings";
import Invoices from "./pages/Invoices";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./authContext";

function Shell() {
  // show sidebar only when logged in
  const { user } = useAuth();
  return (
    <div className="flex h-screen">
      {user && <Sidebar />}
      <div className="flex-1 p-6 overflow-y-auto bg-gray-50">{/* content via routes below */} 
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <Calendar />
              </ProtectedRoute>
            }
          />
          <Route
            path="/working-hours"
            element={
              <ProtectedRoute>
                <WorkingHours />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <Clients />
              </ProtectedRoute>
            }
          />
          <Route
            path="/session-types"
            element={
              <ProtectedRoute>
                <SessionTypes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/form-questions"
            element={
              <ProtectedRoute>
                <FormQuestions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payment-settings"
            element={
              <ProtectedRoute>
                <PaymentSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <Invoices />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
