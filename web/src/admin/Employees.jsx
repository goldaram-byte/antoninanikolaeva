import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../api.js";
import { Panel, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";

// Сотрудники (логины для входа) и роли с галочками прав
export default function Employees() {
  const [staff, setStaff] = useState(null);
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [editStaff, setEditStaff] = useState(null);   // {} = новый
  const [pwdFor, setPwdFor] = useState(null);
  const [editRole, setEditRole] = useState(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([api.get("/api/employees"), api.get("/api/employees/roles")]);
    setStaff(s); setRoles(r);
  }, []);
  useEffect(() => {
    load().catch(() => setStaff([]));
    api.get("/api/employees/permissions").then(setPerms).catch(() => {});
    api.get("/api/catalog/trainers").then(setTrainers).catch(() => {});
  }, [load]);

  const removeStaff = async (s) => {
    if (!confirm(`Удалить сотрудника ${s.name || s.email}? Он больше не сможет войти.`)) return;
    try { await api.del(`/api/employees/${s.id}`); load(); } catch (e) { alert(e.message); }
  };
  const removeRole = async (r) => {
    if (!confirm(`Удалить роль «${r.name}»?`)) return;
    try { await api.del(`/api/employees/roles/${r.id}`); load(); } catch (e) { alert(e.message); }
  };

  if (!staff) return <Spinner />;

  return (
    <>
      <Panel title="Сотрудники" action={<button className={btnPrimary} onClick={() => setEditStaff({})}><Plus size={15} /> Добавить</button>}>
        {staff.length === 0 ? <Empty text="Сотрудников нет." />
          : <ul className="divide-y divide-slate-100">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    {s.name || "Без имени"}
                    {s.is_owner && <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-brand"><ShieldCheck size={11} /> владелец</span>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {s.email} · {s.role_name || "роль не назначена"}
                    {s.scope === "own" && " · только свои клиенты"}
                    {s.trainer_name && ` · тренер: ${s.trainer_name}`}
                  </div>
                </div>
                <button title="Изменить" onClick={() => setEditStaff(s)} className="text-slate-300 hover:text-slate-600"><Pencil size={15} /></button>
                <button title="Сменить пароль" onClick={() => setPwdFor(s)} className="text-slate-300 hover:text-amber-600"><KeyRound size={15} /></button>
                <button title="Удалить" onClick={() => removeStaff(s)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>}
        <p className="mt-3 text-xs text-slate-400">
          Логин сотрудника — его email. Тренеру обычно дают роль «Тренер»: он видит только своих клиентов,
          расписание и отмечает посещаемость.
        </p>
      </Panel>

      <Panel title="Роли и права" action={<button className={btnGhost} onClick={() => setEditRole({ permissions: {}, scope: "all" })}><Plus size={15} /> Новая роль</button>}>
        <ul className="divide-y divide-slate-100">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{r.name}</div>
                <div className="text-xs text-slate-400">
                  {r.is_protected ? "полные права, изменять нельзя"
                    : `${Object.values(r.permissions || {}).filter(Boolean).length} прав · ${r.scope === "own" ? "только свои клиенты" : "все клиенты"}`}
                  {" · сотрудников: "}{r.people}
                </div>
              </div>
              {!r.is_protected && <>
                <button title="Изменить" onClick={() => setEditRole(r)} className="text-slate-300 hover:text-slate-600"><Pencil size={15} /></button>
                <button title="Удалить" onClick={() => removeRole(r)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
              </>}
            </li>
          ))}
        </ul>
      </Panel>

      {editStaff && <StaffForm staff={editStaff} roles={roles} trainers={trainers}
        onClose={() => setEditStaff(null)} onSaved={() => { setEditStaff(null); load(); }} />}
      {pwdFor && <PasswordForm staff={pwdFor} onClose={() => setPwdFor(null)} onSaved={() => setPwdFor(null)} />}
      {editRole && <RoleForm role={editRole} perms={perms}
        onClose={() => setEditRole(null)} onSaved={() => { setEditRole(null); load(); }} />}
    </>
  );
}

function StaffForm({ staff, roles, trainers, onClose, onSaved }) {
  const isNew = !staff.id;
  const [f, setF] = useState({
    email: "", name: "", password: "", ...staff,
    role_id: staff.role_id || "", trainer_id: staff.trainer_id || "",
  });
  const [err, setErr] = useState("");
  const role = roles.find((r) => r.id === f.role_id);

  const save = async () => {
    try {
      const body = { email: f.email, name: f.name, role_id: f.role_id || null, trainer_id: f.trainer_id || null };
      if (isNew) await api.post("/api/employees", { ...body, password: f.password });
      else await api.put(`/api/employees/${f.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };

  return (
    <Modal title={isNew ? "Новый сотрудник" : "Сотрудник"} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      <div className="space-y-4">
        <Field label="Имя и фамилия"><input className={inputCls} value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Email (это логин для входа)"><input className={inputCls} value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        {isNew && <Field label="Пароль (от 8 символов)"><input className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
        <Field label="Роль">
          <select className={inputCls} value={f.role_id} onChange={(e) => setF({ ...f, role_id: e.target.value })}>
            <option value="">— без роли (доступа не будет) —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        {role?.scope === "own" && (
          <Field label="Какой это тренер (чтобы видеть только своих клиентов)">
            <select className={inputCls} value={f.trainer_id} onChange={(e) => setF({ ...f, trainer_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-400">Если не выбрать — сотрудник увидит всех клиентов.</span>
          </Field>
        )}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

function PasswordForm({ staff, onClose, onSaved }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const save = async () => {
    try { await api.post(`/api/employees/${staff.id}/password`, { password }); setDone(true); setTimeout(onSaved, 1200); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={`Новый пароль — ${staff.name || staff.email}`} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save} disabled={done}>Сохранить</button></>}>
      <div className="space-y-3">
        <Field label="Пароль (от 8 символов)"><input className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
        <p className="text-xs text-slate-400">Передайте пароль сотруднику лично — в системе он больше не показывается.</p>
        {done && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ Пароль изменён</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

function RoleForm({ role, perms, onClose, onSaved }) {
  const isNew = !role.id;
  const [f, setF] = useState({ name: "", scope: "all", ...role, permissions: { ...(role.permissions || {}) } });
  const [err, setErr] = useState("");
  const toggle = (key) => setF((p) => ({ ...p, permissions: { ...p.permissions, [key]: !p.permissions[key] } }));

  const save = async () => {
    try {
      const body = { name: f.name, scope: f.scope, permissions: f.permissions };
      if (isNew) await api.post("/api/employees/roles", body);
      else await api.put(`/api/employees/roles/${f.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };

  return (
    <Modal title={isNew ? "Новая роль" : `Роль: ${role.name}`} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      <div className="space-y-4">
        <Field label="Название роли"><input className={inputCls} value={f.name} placeholder="напр. Тренер" onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Каких клиентов видит">
          <select className={inputCls} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
            <option value="all">Всех клиентов центра</option>
            <option value="own">Только своих (закреплённых за этим тренером)</option>
          </select>
        </Field>
        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">Что разрешено</div>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {perms.map((p) => (
              <label key={p.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4" checked={!!f.permissions[p.key]} onChange={() => toggle(p.key)} />
                <span className="text-slate-700">{p.label}</span>
              </label>
            ))}
          </div>
        </div>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

// Смена собственного пароля — доступна любому сотруднику
export function MyPasswordModal({ onClose }) {
  const [f, setF] = useState({ current: "", password: "", repeat: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const save = async () => {
    setErr("");
    if (f.password !== f.repeat) return setErr("Пароли не совпадают");
    try { await api.post("/api/employees/me/password", { current: f.current, password: f.password }); setDone(true); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Смена своего пароля" onClose={onClose}
      footer={done ? <button className={btnPrimary} onClick={onClose}>Закрыть</button>
        : <><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сменить</button></>}>
      {done ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✓ Пароль изменён. В следующий раз входите с новым.</div>
        : <div className="space-y-3">
          <Field label="Текущий пароль"><input type="password" className={inputCls} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoFocus /></Field>
          <Field label="Новый пароль (от 8 символов)"><input type="password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Повторите новый пароль"><input type="password" className={inputCls} value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        </div>}
    </Modal>
  );
}
