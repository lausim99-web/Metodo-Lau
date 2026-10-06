import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./auth";
import Login from "./pages/Login";
import ClientDashboard from "./pages/ClientDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ClientDetail from "./pages/ClientDetail";
import Profile from "./pages/Profile";
import ForcePassword from "./pages/ForcePassword";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0D]">
      <div className="text-yellow-400 font-display uppercase tracking-widest text-sm animate-pulse">Caricamento...</div>
    </div>
  );
}

function Protected({ role, children }) {
  const { user } = useAuth();
  if (user === null) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === "admin" ? "/admin" : "/"} replace />;
  if (user.must_change_password) return <ForcePassword />;
  return children;
}

function RootRedirect() {
  const { user } = useAuth();
  if (user === null) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <ForcePassword />;
  return user.role === "admin" ? <Navigate to="/admin" replace /> : <ClientDashboard />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#121218", color: "#fff", border: "1px solid #262633" } }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
          <Route path="/admin/clients/:id" element={<Protected role="admin"><ClientDetail /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
