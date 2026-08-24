import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getToken } from "./api.js";
import { Spinner } from "./ui.jsx";

// Зоны грузятся отдельными чанками: клиент в кабинете не тянет код админки.
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));
const AdminLogin = lazy(() => import("./admin/AdminLogin.jsx"));
const CabinetApp = lazy(() => import("./cabinet/CabinetApp.jsx"));
const CabinetLogin = lazy(() => import("./cabinet/CabinetLogin.jsx"));

const role = () => localStorage.getItem("role");

function Guard({ need, children, loginPath }) {
  const loc = useLocation();
  if (!getToken() || role() !== need) return <Navigate to={loginPath} state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/cabinet" replace />} />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={
          <Guard need="employee" loginPath="/admin/login"><AdminApp /></Guard>
        } />

        <Route path="/cabinet/login" element={<CabinetLogin />} />
        <Route path="/cabinet/*" element={
          <Guard need="client" loginPath="/cabinet/login"><CabinetApp /></Guard>
        } />

        <Route path="*" element={<Navigate to="/cabinet" replace />} />
      </Routes>
    </Suspense>
  );
}
