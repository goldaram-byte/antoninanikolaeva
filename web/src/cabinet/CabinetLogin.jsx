import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InstallPWA from "./InstallPWA.jsx";
import { api, setSession } from "../api.js";
import { inputCls, btnPrimary, Field } from "../ui.jsx";

export default function CabinetLogin() {
  const nav = useNavigate();
  const [tab, setTab] = useState("login");          // login | register
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = (token, name) => { setSession(token, "client", name); nav("/cabinet"); };
  const switchTab = (t) => { setTab(t); setErr(""); setPassword(""); setPassword2(""); };

  const submitLogin = async () => {
    setErr(""); setBusy(true);
    try { const { token, name } = await api.clientLogin(phone, password); enter(token, name); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const submitRegister = async () => {
    setErr("");
    if (password.length < 4) { setErr("Пароль не короче 4 символов"); return; }
    if (password !== password2) { setErr("Пароли не совпадают"); return; }
    setBusy(true);
    try {
      // сначала проверяем, есть ли номер в базе школы
      const chk = await api.clientCheck(phone);
      if (!chk.found) { setErr("Этот номер не найден в базе школы. Зарегистрироваться может только действующий ученик — обратитесь к администратору."); setBusy(false); return; }
      if (chk.has_password) { setErr("Пароль для этого номера уже создан. Перейдите во «Вход»."); setBusy(false); return; }
      const { token, name } = await api.clientRegister(phone, password);
      enter(token, name);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-black to-black p-4">
      <div className="w-full max-w-sm">
        <img src="/logo.png" alt="Школа каратэ Николаевой Антонины" className="mx-auto mb-6 h-24" />
        <div className="rounded-2xl bg-white p-7 shadow-xl">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <button onClick={() => switchTab("login")} className={`rounded-lg py-2 text-sm font-medium transition ${tab === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Вход</button>
            <button onClick={() => switchTab("register")} className={`rounded-lg py-2 text-sm font-medium transition ${tab === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Регистрация</button>
          </div>

          {tab === "login" ? (
            <div className="space-y-4">
              <Field label="Телефон"><input className={inputCls} placeholder="+7…" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitLogin()} /></Field>
              <Field label="Пароль"><input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitLogin()} /></Field>
              {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
              <button className={btnPrimary + " w-full"} disabled={busy} onClick={submitLogin}>{busy ? "Вход…" : "Войти"}</button>
              <p className="text-center text-xs text-slate-400">Впервые здесь? Нажмите «Регистрация» и придумайте пароль.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Телефон"><input className={inputCls} placeholder="+7…" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Придумайте пароль"><input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="Повторите пароль"><input type="password" className={inputCls} value={password2} onChange={(e) => setPassword2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitRegister()} /></Field>
              {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
              <button className={btnPrimary + " w-full"} disabled={busy} onClick={submitRegister}>{busy ? "Создаём…" : "Создать пароль и войти"}</button>
              <p className="text-center text-xs text-slate-400">Регистрация доступна только ученикам школы — по номеру, который есть у нас в базе. Если номер не подходит, сообщите его администратору.</p>
            </div>
          )}
        </div>
        <div className="mt-3"><InstallPWA /></div>
      </div>
    </div>
  );
}
