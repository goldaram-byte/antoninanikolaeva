import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession } from "../api.js";
import { inputCls, btnPrimary, Field } from "../ui.jsx";

export default function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const res = await api.adminLogin(email, password);
      setSession(res.token, "employee", res.name, { perms: res.perms, scope: res.scope, roleName: res.roleName, isOwner: res.isOwner });
      nav("/admin");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-black p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-slate-900">Школа каратэ</div>
            <div className="text-xs text-slate-400">Николаевой Антонины · панель управления</div>
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Email"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          <Field label="Пароль"><input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
          <button className={btnPrimary + " w-full"} disabled={busy} onClick={submit}>{busy ? "Вход…" : "Войти"}</button>
          <a href="/cabinet/login" className="block text-center text-xs text-slate-400 hover:text-slate-600">Вход для клиентов →</a>
        </div>
      </div>
    </div>
  );
}
