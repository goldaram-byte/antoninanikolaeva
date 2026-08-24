import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, Trash2 } from "lucide-react";
import { api, hasPerm } from "../api.js";
import { useSettings } from "../settings.jsx";
import { Header, Panel, Empty, Spinner, inputCls, money } from "../ui.jsx";
import { METHODS } from "./BuyModal.jsx";

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const today = () => new Date().toISOString().slice(0, 10);

export default function Finance() {
  const { currency } = useSettings();
  const [tab, setTab] = useState("ops");           // ops | debtors
  const [branches, setBranches] = useState([]);
  const [f, setF] = useState({ from: monthStart(), to: today(), method: "", branch_id: "" });
  const [ops, setOps] = useState(null);
  const [sum, setSum] = useState(null);
  const [debtors, setDebtors] = useState(null);

  useEffect(() => { api.get("/api/branches").then(setBranches).catch(() => {}); }, []);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (f.method) p.set("method", f.method);
    if (f.branch_id) p.set("branch_id", f.branch_id);
    const [o, s] = await Promise.all([
      api.get(`/api/payments?${p.toString()}`),
      api.get(`/api/payments/summary?${p.toString()}`),
    ]);
    setOps(o); setSum(s);
  }, [f]);
  useEffect(() => { load().catch(() => { setOps([]); setSum(null); }); }, [load]);
  useEffect(() => {
    const p = f.branch_id ? `?branch_id=${f.branch_id}` : "";
    api.get(`/api/payments/debtors${p}`).then(setDebtors).catch(() => setDebtors([]));
  }, [f.branch_id]);

  const refund = async (p) => {
    if (!confirm(`Оформить возврат ${money(p.amount, currency)} по оплате «${p.note || p.method}»?`)) return;
    await api.post(`/api/payments/${p.id}/refund`, {}); load();
  };
  const remove = async (p) => {
    if (!confirm("Удалить операцию? Оплаченная сумма вернётся в долг абонемента.")) return;
    await api.del(`/api/payments/${p.id}`); load();
  };

  return (
    <div className="space-y-5">
      <Header title="Оплаты и долги" subtitle="Все операции и должники по филиалам" />

      <div className="flex gap-1 border-b border-slate-200">
        {[{ id: "ops", label: "Операции" }, { id: "debtors", label: `Должники${debtors ? ` · ${debtors.length}` : ""}` }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-slate-500">С</span>
          <input type="date" className={inputCls + " w-auto"} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-xs text-slate-500">По</span>
          <input type="date" className={inputCls + " w-auto"} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <select className={inputCls + " w-auto"} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
          <option value="">Все филиалы</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {tab === "ops" && (
          <select className={inputCls + " w-auto"} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            <option value="">Все способы</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="бонусы">бонусы</option>
          </select>
        )}
      </div>

      {tab === "ops" && <>
        {sum && (
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Приход" value={money(sum.income, currency)} cls="text-emerald-600" />
            <Stat label="Возвраты" value={money(sum.refunds, currency)} cls="text-red-500" />
            <Stat label="Итого" value={money(sum.net, currency)} cls="text-slate-900" />
          </div>
        )}
        {sum && sum.byMethod?.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {sum.byMethod.map((m) => (
              <span key={m.method} className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{m.method}: <b>{money(m.sum, currency)}</b></span>
            ))}
          </div>
        )}
        {!ops ? <Spinner /> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            {ops.length === 0 ? <Empty text="Операций за период нет." />
              : <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2.5">Дата</th><th className="px-4 py-2.5">Клиент</th><th className="px-4 py-2.5">Что</th><th className="px-4 py-2.5">Филиал</th><th className="px-4 py-2.5">Способ</th><th className="px-4 py-2.5 text-right">Сумма</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ops.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500">{fmtDate(p.created_at)}</td>
                      <td className="px-4 py-2.5"><Link to={`/admin/clients/${p.client_id}`} className="font-medium text-slate-800 hover:text-brand">{p.client_name}</Link>
                        {p.payer && <span className="block text-xs text-slate-400">оплатил(а): {p.payer}</span>}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.sub_name || p.note || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.branch_name || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.method}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${p.op_type === "refund" ? "text-red-500" : "text-emerald-600"}`}>
                        {p.op_type === "refund" ? "−" : ""}{money(p.amount, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {hasPerm("payments_manage") && p.op_type === "payment" && (
                          <span className="inline-flex gap-2">
                            <button title="Возврат" onClick={() => refund(p)} className="text-slate-300 hover:text-amber-500"><RotateCcw size={15} /></button>
                            <button title="Удалить" onClick={() => remove(p)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>}
          </div>
        )}
      </>}

      {tab === "debtors" && (
        !debtors ? <Spinner /> : (
          <Panel title="Должники — абонемент выдан, но не оплачен полностью">
            {debtors.length === 0 ? <Empty text="Долгов нет — отлично!" />
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr><th className="py-2 pr-4">Клиент</th><th className="py-2 pr-4">Филиал</th><th className="py-2 pr-4">Что не оплачено</th><th className="py-2 pr-4">С какого числа</th><th className="py-2 text-right">Долг</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {debtors.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-4">
                          <Link to={`/admin/clients/${d.id}`} className="font-medium text-slate-800 hover:text-brand">{d.name}</Link>
                          {d.phone && <span className="block text-xs text-slate-400">{d.phone}</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-500">{d.branch_name || "—"}</td>
                        <td className="py-2.5 pr-4 text-slate-500">{d.what}</td>
                        <td className="py-2.5 pr-4 text-slate-500">{fmtDate(d.since)}</td>
                        <td className="py-2.5 text-right font-semibold text-red-600">{money(d.debt, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
            <p className="mt-3 text-xs text-slate-400">Правило «закреплён в группе, но не оплатил месяц до 5 числа» включится на этапе 3 вместе с группами.</p>
          </Panel>
        )
      )}
    </div>
  );
}

function Stat({ label, value, cls }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
