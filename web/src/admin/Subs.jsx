import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { useSettings } from "../settings.jsx";
import { Header, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost, money } from "../ui.jsx";

const kindLabel = { sessions: "по занятиям", unlimited: "безлимит" };

export default function Subs() {
  const { currency } = useSettings();
  const [list, setList] = useState(null);
  const [branches, setBranches] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => setList(await api.get("/api/catalog/subscription-types")), []);
  useEffect(() => {
    load().catch(() => setList([]));
    api.get("/api/branches").then(setBranches).catch(() => {});
  }, [load]);

  if (!list) return <Spinner />;
  const groups = [
    { key: "group", title: "Групповые тренировки", items: list.filter((s) => (s.training_type || "group") !== "personal") },
    { key: "personal", title: "Персональные тренировки", items: list.filter((s) => s.training_type === "personal") },
  ];
  return (
    <div className="space-y-6">
      <Header title="Абонементы" subtitle="Тарифы для выдачи клиентам. У каждого филиала может быть своя цена."
        action={<button className={btnPrimary} onClick={() => setEdit({})}><Plus size={16} /> Новый тариф</button>} />
      {list.length === 0 && <p className="text-sm text-slate-400">Тарифов пока нет. Создайте первый.</p>}
      {groups.map((g) => g.items.length === 0 ? null : (
        <div key={g.key} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{g.title} · {g.items.length}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((s) => {
              const bp = s.branch_prices || {};
              const hasBranchPrices = Object.keys(bp).length > 0;
              return (
                <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{s.name}</span>
                      {s.training_type === "personal"
                        ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">персон.</span>
                        : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">группа</span>}
                    </div>
                    <button onClick={() => setEdit(s)} className="text-slate-300 hover:text-slate-600"><Pencil size={15} /></button>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-brand">{money(s.price, currency)}</div>
                  {hasBranchPrices && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {branches.filter((b) => bp[b.id] != null).map((b) => (
                        <li key={b.id}>{b.name}: <b>{money(bp[b.id], currency)}</b></li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5">{kindLabel[s.kind]}</span>
                    {s.kind === "sessions" && <span className="rounded bg-slate-100 px-2 py-0.5">{s.sessions} зан.</span>}
                    <span className="rounded bg-slate-100 px-2 py-0.5">{s.days} дней</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {edit && <SubForm subType={edit} branches={branches} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function SubForm({ subType, branches, onClose, onSaved }) {
  const { currency } = useSettings();
  const [f, setF] = useState({
    name: "", kind: "sessions", sessions: 8, days: 30, price: 4000, training_type: "group", ...subType,
    branch_prices: { ...(subType.branch_prices || {}) },
  });
  const isNew = !subType.id;
  const limited = f.kind !== "unlimited";
  const setLimited = (on) => setF((p) => ({ ...p, kind: on ? "sessions" : "unlimited", sessions: on ? (p.sessions || 8) : 0 }));
  const setBranchPrice = (id, v) => setF((p) => ({ ...p, branch_prices: { ...p.branch_prices, [id]: v } }));

  const save = async () => {
    if (!f.name.trim()) return;
    const branch_prices = {};
    for (const [k, v] of Object.entries(f.branch_prices)) if (v !== "" && v != null) branch_prices[k] = Number(v);
    const body = { ...f, sessions: limited ? (Number(f.sessions) || 0) : 0, branch_prices };
    if (isNew) await api.post("/api/catalog/subscription-types", body);
    else await api.put(`/api/catalog/subscription-types/${f.id}`, body);
    onSaved();
  };
  const remove = async () => {
    if (!confirm("Убрать тариф из каталога? Уже выданные абонементы не пострадают.")) return;
    await api.del(`/api/catalog/subscription-types/${f.id}`); onSaved();
  };
  return (
    <Modal title={isNew ? "Новый тариф" : "Тариф"} onClose={onClose}
      footer={<>{!isNew && <button onClick={remove} className="mr-auto inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"><Trash2 size={15} /> Убрать</button>}
        <button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      <div className="space-y-4">
        <Field label="Название"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Тип тренировок">
          <select className={inputCls} value={f.training_type || "group"} onChange={(e) => setF({ ...f, training_type: e.target.value })}>
            <option value="group">Групповые</option>
            <option value="personal">Персональные</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Базовая цена, ${currency}`}><input type="number" className={inputCls} value={f.price} onChange={(e) => setF({ ...f, price: +e.target.value })} /></Field>
          <Field label="Срок (дней)"><input type="number" className={inputCls} value={f.days} onChange={(e) => setF({ ...f, days: +e.target.value })} /></Field>
        </div>

        {branches.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1 text-sm font-medium text-slate-700">Цены по филиалам</div>
            <p className="mb-3 text-xs text-slate-400">Оставьте поле пустым — будет действовать базовая цена.</p>
            <div className="grid grid-cols-2 gap-3">
              {branches.map((b) => (
                <label key={b.id} className="block">
                  <span className="mb-1 block truncate text-xs text-slate-500">{b.name}</span>
                  <input type="number" className={inputCls} placeholder={String(f.price)}
                    value={f.branch_prices[b.id] ?? ""} onChange={(e) => setBranchPrice(b.id, e.target.value)} />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} className="h-4 w-4" />
            Ограничить количеством занятий
          </label>
          {limited ? (
            <div className="mt-3">
              <Field label="Количество занятий"><input type="number" min="1" className={inputCls} value={f.sessions} onChange={(e) => setF({ ...f, sessions: +e.target.value })} /></Field>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">Безлимит — количество занятий не ограничено, действует по сроку ({f.days} дней).</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
