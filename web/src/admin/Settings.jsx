import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { api, hasPerm } from "../api.js";
import { useSettings } from "../settings.jsx";
import { Header, Panel, Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";

export default function Settings() {
  return (
    <div className="space-y-5">
      <Header title="Настройки" subtitle="Школа, филиалы, тренеры, направления, бонусы" />
      {hasPerm("settings_manage") && <General />}
      {hasPerm("settings_manage") && <Branches />}
      {(hasPerm("employees_manage") || hasPerm("settings_manage")) && <Trainers />}
      {hasPerm("settings_manage") && <Disciplines />}
      {hasPerm("settings_manage") && <Loyalty />}
    </div>
  );
}

function General() {
  const { settings, reload } = useSettings();
  const setSetting = async (key, value) => { await api.put(`/api/catalog/settings/${key}`, { value }); reload(); };
  return (
    <Panel title="Общее">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-600">Название школы</span>
          <input className={inputCls} defaultValue={settings.club_name || ""} onBlur={(e) => setSetting("club_name", e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-600">Валюта</span>
          <select className={inputCls} value={settings.currency || "₽"} onChange={(e) => setSetting("currency", e.target.value)}>
            <option value="₽">₽ рубль</option><option value="€">€ евро</option><option value="$">$ доллар</option><option value="֏">֏ драм</option>
          </select></label>
      </div>
    </Panel>
  );
}

// ===== Филиалы: создание, переименование, адрес, удаление =====
function Branches() {
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => setList(await api.get("/api/branches")), []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const remove = async (b) => {
    if (!confirm(`Удалить филиал «${b.name}»?`)) return;
    try { await api.del(`/api/branches/${b.id}`); }
    catch (e) { if (!confirm(e.message)) return; await api.del(`/api/branches/${b.id}?force=1`); }
    load();
  };

  return (
    <Panel title="Филиалы" action={<button className={btnPrimary} onClick={() => setEdit({})}><Plus size={15} /> Добавить</button>}>
      {list.length === 0 && <p className="text-sm text-slate-400">Филиалов пока нет.</p>}
      <ul className="divide-y divide-slate-100">
        {list.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800">{b.name}</div>
              <div className="truncate text-xs text-slate-400">{b.address || "адрес не указан"}</div>
            </div>
            <button onClick={() => setEdit(b)} className="text-slate-300 hover:text-slate-600"><Pencil size={15} /></button>
            <button onClick={() => remove(b)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      {edit && <BranchForm branch={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </Panel>
  );
}

function BranchForm({ branch, onClose, onSaved }) {
  const isNew = !branch.id;
  const [f, setF] = useState({ name: "", address: "", ...branch });
  const [err, setErr] = useState("");
  const save = async () => {
    if (!f.name.trim()) return setErr("Укажите название");
    try {
      if (isNew) await api.post("/api/branches", { name: f.name, address: f.address });
      else await api.put(`/api/branches/${f.id}`, { name: f.name, address: f.address });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={isNew ? "Новый филиал" : "Филиал"} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      <div className="space-y-4">
        <Field label="Название"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="напр. Центральный" /></Field>
        <Field label="Адрес"><input className={inputCls} value={f.address || ""} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="город, улица, дом" /></Field>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

// ===== Тренеры: имя + условия зарплаты (процент / оклад + процент) =====
function Trainers() {
  const { currency } = useSettings();
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => setList(await api.get("/api/catalog/trainers")), []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const remove = async (t) => {
    if (!confirm(`Удалить тренера «${t.name}»?`)) return;
    await api.del(`/api/catalog/trainers/${t.id}`); load();
  };

  return (
    <Panel title="Тренеры" action={<button className={btnPrimary} onClick={() => setEdit({})}><Plus size={15} /> Добавить</button>}>
      {list.length === 0 && <p className="text-sm text-slate-400">Тренеров пока нет.</p>}
      <ul className="divide-y divide-slate-100">
        {list.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800">{t.name}</div>
              <div className="text-xs text-slate-400">
                {t.salary_mode === "salary_percent"
                  ? `оклад ${Number(t.salary_fixed).toLocaleString("ru-RU")} ${currency} + ${Number(t.percent)}% от оплат`
                  : `${Number(t.percent)}% от оплат`}
              </div>
            </div>
            <button onClick={() => setEdit(t)} className="text-slate-300 hover:text-slate-600"><Pencil size={15} /></button>
            <button onClick={() => remove(t)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      {edit && <TrainerForm trainer={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </Panel>
  );
}

function TrainerForm({ trainer, onClose, onSaved }) {
  const { currency } = useSettings();
  const isNew = !trainer.id;
  const [f, setF] = useState({ name: "", salary_mode: "percent", salary_fixed: 0, percent: 0, ...trainer });
  const [err, setErr] = useState("");
  const save = async () => {
    if (!f.name.trim()) return setErr("Укажите имя");
    try {
      const body = { name: f.name, salary_mode: f.salary_mode, salary_fixed: Number(f.salary_fixed) || 0, percent: Number(f.percent) || 0 };
      if (isNew) await api.post("/api/catalog/trainers", body);
      else await api.put(`/api/catalog/trainers/${f.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={isNew ? "Новый тренер" : "Тренер"} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      <div className="space-y-4">
        <Field label="Имя и фамилия"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Схема зарплаты">
          <select className={inputCls} value={f.salary_mode} onChange={(e) => setF({ ...f, salary_mode: e.target.value })}>
            <option value="percent">Процент от оплат</option>
            <option value="salary_percent">Оклад + процент от оплат</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {f.salary_mode === "salary_percent" && (
            <Field label={`Оклад в месяц, ${currency}`}><input type="number" className={inputCls} value={f.salary_fixed} onChange={(e) => setF({ ...f, salary_fixed: e.target.value })} /></Field>
          )}
          <Field label="Процент от оплат, %"><input type="number" className={inputCls} value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-slate-400">Сам расчёт зарплаты (по оплатам учеников тренера за месяц) появится в разделе «Зарплата» на этапе 5.</p>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

// ===== Направления =====
function Disciplines() {
  const [disc, setDisc] = useState([]);
  const [name, setName] = useState("");
  const load = useCallback(async () => setDisc(await api.get("/api/catalog/disciplines")), []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const colors = ["#DC2626", "#2563EB", "#7C3AED", "#059669", "#D97706", "#DB2777", "#0891B2"];
  const add = async () => { if (!name.trim()) return; await api.post("/api/catalog/disciplines", { name: name.trim(), color: colors[disc.length % colors.length] }); setName(""); load(); };
  const del = async (id) => { await api.del(`/api/catalog/disciplines/${id}`); load(); };
  return (
    <Panel title="Направления">
      <div className="mb-3 flex gap-2">
        <input className={inputCls} placeholder="напр. ОФП" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className={btnPrimary} onClick={add}><Plus size={16} /></button>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {disc.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="flex items-center gap-2 text-sm"><span className="h-3 w-3 rounded-full" style={{ background: d.color }} /> {d.name}</span>
            <button onClick={() => del(d.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ===== Лояльность =====
function Loyalty() {
  const { settings, currency, reload } = useSettings();
  const [all, setAll] = useState({});
  useEffect(() => { api.get("/api/catalog/settings/all").then(setAll).catch(() => {}); }, []);
  const setSetting = async (key, value) => { await api.put(`/api/catalog/settings/${key}`, { value }); reload(); };
  return (
    <Panel title="Бонусы и рефералы">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-600">Кешбэк с покупок, %</span>
          <input type="number" className={inputCls} defaultValue={all.loyalty_cashback_percent || "0"} onBlur={(e) => setSetting("loyalty_cashback_percent", e.target.value)} />
          <span className="mt-1 block text-xs text-slate-400">Баллами с каждой оплаты абонемента</span></label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-600">Бонус пригласившему, %</span>
          <input type="number" className={inputCls} defaultValue={all.referral_referrer_percent || "5"} onBlur={(e) => setSetting("referral_referrer_percent", e.target.value)} />
          <span className="mt-1 block text-xs text-slate-400">Баллами с первой покупки приглашённого</span></label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-600">Бонус новичку, %</span>
          <input type="number" className={inputCls} defaultValue={all.referral_friend_percent || "0"} onBlur={(e) => setSetting("referral_friend_percent", e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium text-slate-600">Стоимость 1 балла, {currency}</span>
          <input type="number" className={inputCls} defaultValue={all.points_to_currency || "1"} onBlur={(e) => setSetting("points_to_currency", e.target.value)} /></label>
      </div>
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Баллы уже начисляются и списываются при выдаче абонементов. Отдельный раздел «Лояльность» с рейтингом приглашений появится на этапе 4.</p>
    </Panel>
  );
}
