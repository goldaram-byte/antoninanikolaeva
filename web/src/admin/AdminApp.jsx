import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard, Users, CalendarDays, ClipboardCheck, Ticket, Wallet,
  Settings as SettingsIcon, LogOut, Gift, ClipboardList, CalendarClock, Menu, ListChecks, Hourglass,
} from "lucide-react";
import { clearSession, hasPerm, roleName } from "../api.js";
import { SettingsProvider } from "../settings.jsx";

import Dashboard from "./Dashboard.jsx";
import Clients from "./Clients.jsx";
import ClientDetail from "./ClientDetail.jsx";
import Subs from "./Subs.jsx";
import Finance from "./Finance.jsx";
import SettingsScreen from "./Settings.jsx";

// Разделы админки. stage — на каком этапе раздел появится (до этого — заглушка).
const nav = [
  { to: "/admin", end: true, label: "Дашборд", icon: LayoutDashboard, perm: null },
  { to: "/admin/clients", label: "Клиенты", icon: Users, perm: "clients_view" },
  { to: "/admin/funnel", label: "Воронка продаж", icon: ClipboardList, perm: "leads_manage", stage: 5 },
  { to: "/admin/tasks", label: "Задачи", icon: ListChecks, perm: "clients_view", stage: 5 },
  { to: "/admin/schedule", label: "Расписание", icon: CalendarDays, perm: "schedule_view", stage: 3 },
  { to: "/admin/journal", label: "Посещаемость", icon: ClipboardCheck, perm: "attendance_view", stage: 3 },
  { to: "/admin/personal", label: "Журнал записи", icon: CalendarClock, perm: "schedule_view", stage: 3 },
  { to: "/admin/subs", label: "Абонементы", icon: Ticket, perm: "subs_manage" },
  { to: "/admin/finance", label: "Оплаты и долги", icon: Wallet, perm: "finance_view" },
  { to: "/admin/salary", label: "Зарплата", icon: Wallet, perm: "reports_salary", stage: 5 },
  { to: "/admin/loyalty", label: "Лояльность", icon: Gift, perm: "loyalty_view", stage: 4 },
  { to: "/admin/settings", label: "Настройки", icon: SettingsIcon, anyPerm: ["settings_manage", "employees_manage"] },
];

// Временная страница для разделов следующих этапов
function Stub({ label, stage }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
      <Hourglass size={36} />
      <div className="text-lg font-semibold text-slate-500">{label}</div>
      <div className="text-sm">Раздел появится на этапе {stage} разработки</div>
    </div>
  );
}

export default function AdminApp() {
  const navigate = useNavigate();
  const logout = () => { clearSession(); navigate("/admin/login"); };
  const name = localStorage.getItem("name");
  const visible = nav.filter((n) => (!n.perm || hasPerm(n.perm)) && (!n.anyPerm || n.anyPerm.some(hasPerm)));
  const [menuOpen, setMenuOpen] = useState(false);

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-brand text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`;

  return (
    <SettingsProvider>
      <div className="min-h-screen bg-slate-50 lg:flex lg:h-screen lg:flex-col lg:overflow-hidden">
        {/* Верхняя панель (только телефон) */}
        <div className="sticky top-0 z-30 flex items-center gap-3 bg-brand-black px-4 py-3 text-white lg:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded-lg p-1 hover:bg-white/10"><Menu size={22} /></button>
          <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-sm font-bold uppercase tracking-wider">Школа каратэ</span>
          <button onClick={logout} title="Выйти" className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white">
            <LogOut size={16} /> Выйти
          </button>
        </div>

        <div className="flex lg:min-h-0 lg:flex-1">
          {menuOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} />}

          <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col bg-brand-black text-slate-300 transition-transform lg:static lg:z-auto lg:w-56 lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex items-center gap-2.5 px-5 py-5">
              <img src="/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-white">Школа каратэ</div>
                <div className="text-[10px] text-slate-400">Николаевой Антонины</div>
              </div>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
              {visible.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} onClick={() => setMenuOpen(false)}>
                  <n.icon size={17} />
                  <span className="flex-1">{n.label}</span>
                  {n.stage && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">скоро</span>}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-white/10 px-5 py-4">
              <div className="mb-2 text-xs text-slate-400">{name} · {roleName()}</div>
              <button onClick={logout} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"><LogOut size={16} /> Выйти</button>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="subs" element={<Subs />} />
              <Route path="finance" element={<Finance />} />
              <Route path="settings" element={<SettingsScreen />} />
              {nav.filter((n) => n.stage).map((n) => (
                <Route key={n.to} path={n.to.replace("/admin/", "")} element={<Stub label={n.label} stage={n.stage} />} />
              ))}
            </Routes>
          </main>
        </div>
      </div>
    </SettingsProvider>
  );
}
