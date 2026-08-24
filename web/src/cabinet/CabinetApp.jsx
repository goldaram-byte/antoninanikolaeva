import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Home, Ticket, QrCode, Gift, User, LogOut, Hourglass } from "lucide-react";
import { api, clearSession } from "../api.js";
import { SettingsProvider, useSettings } from "../settings.jsx";
import { Spinner } from "../ui.jsx";

// Нижние вкладки кабинета. stage — этап, на котором вкладка заработает.
const tabs = [
  { to: "/cabinet", end: true, label: "Главная", icon: Home },
  { to: "/cabinet/subs", label: "Абонементы", icon: Ticket, stage: 4 },
  { to: "/cabinet/qr", label: "QR-код", icon: QrCode, stage: 4 },
  { to: "/cabinet/bonus", label: "Бонусы", icon: Gift, stage: 5 },
  { to: "/cabinet/profile", label: "Профиль", icon: User },
];

function Stub({ label, stage }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
      <Hourglass size={32} />
      <div className="font-semibold text-slate-500">{label}</div>
      <div className="text-sm">Появится на этапе {stage}</div>
    </div>
  );
}

function HomeScreen({ me }) {
  const { clubName } = useSettings();
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-brand-black to-black p-5 text-white">
        <div className="text-xs uppercase tracking-wider text-red-400">{clubName}</div>
        <div className="mt-1 text-xl font-bold">Привет, {me?.name?.split(" ")[0] || "спортсмен"}!</div>
        <p className="mt-2 text-sm text-slate-300">
          Личный кабинет ученика запущен. Скоро здесь появятся ваши абонементы,
          запись на занятия, QR-код для прохода и бонусы.
        </p>
      </div>
    </div>
  );
}

function ProfileScreen({ me }) {
  const navigate = useNavigate();
  const logout = () => { clearSession(); navigate("/cabinet/login"); };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="text-lg font-bold text-slate-900">{me?.name}</div>
        <div className="mt-1 text-sm text-slate-500">{me?.phone}</div>
        {me?.email && <div className="text-sm text-slate-500">{me.email}</div>}
      </div>
      <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
        <LogOut size={16} /> Выйти
      </button>
    </div>
  );
}

export default function CabinetApp() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/me").then(setMe).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <SettingsProvider>
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100">
        <main className="flex-1 p-4 pb-24">
          {loading ? <Spinner /> : (
            <Routes>
              <Route index element={<HomeScreen me={me} />} />
              <Route path="profile" element={<ProfileScreen me={me} />} />
              {tabs.filter((t) => t.stage).map((t) => (
                <Route key={t.to} path={t.to.replace("/cabinet/", "")} element={<Stub label={t.label} stage={t.stage} />} />
              ))}
            </Routes>
          )}
        </main>

        {/* Нижняя навигация (мобильная, как в приложении) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-slate-200 bg-white">
          <div className="grid grid-cols-5">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${isActive ? "text-brand" : "text-slate-400"}`}>
                <t.icon size={20} />
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </SettingsProvider>
  );
}
