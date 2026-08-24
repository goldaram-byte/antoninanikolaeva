import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getToken } from "./api.js";
import { Spinner } from "./ui.jsx";

const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));
const AdminLogin = lazy(() => import("./admin/AdminLogin.jsx"));

function Guard({ children }) {
  const loc = useLocation();
  if (!getToken() || localStorage.getItem("role") !== "employee")
    return <Navigate to="/admin/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner /></div>}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<Guard><AdminApp /></Guard>} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Suspense>
  );
}
