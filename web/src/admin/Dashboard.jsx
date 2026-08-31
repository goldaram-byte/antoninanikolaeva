import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Ticket, AlertCircle, Wallet } from "lucide-react";
import { api } from "../api.js";
import { Header, Panel, Empty, Spinner, money, inputCls } from "../ui.jsx";

export default function Dashboard() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");        // "" = все филиалы
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/api/branches").then(setBranches).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    api.get(`/api/dashboard${branchId ? `?branch_id=${branchId}` : ""}`)
      .then(setData).catch(() => setData({ clients: 0, active_subs: 0, debt: 0, debtors: 0, month_income: 0, byBranch: [], lastPayments: [] }));
  }, [branchId]);

  const Card = ({ icon: Icon, label, value, tone }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-sm text-slate-500">{label}<Icon size={18} className={tone} /></div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Header title="Дашборд" subtitle={branchId ? branches.find((b) => b.id === branchId)?.name : "Все филиалы"}
        action={
          <select className={inputCls + " w-auto"} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Все филиалы</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        } />

      {!data ? <Spinner /> : <>
        <div className={`grid gap-4 ${data.can_finance ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`}>
          <Card icon={Users} label="Клиентов" value={data.clients} tone="text-blue-500" />
          <Card icon={Ticket} label="Активных абонементов" value={data.active_subs} tone="text-emerald-500" />
          {data.can_finance && <>
            <Card icon={Wallet} label="Выручка за месяц" value={money(data.month_income)} tone="text-brand" />
            <Card icon={AlertCircle} label={`Долг (${data.debtors} чел.)`} value={money(data.debt)} tone="text-red-500" />
          </>}
        </div>

        {!branchId && data.byBranch.length > 0 && (
          <Panel title="По филиалам">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="py-2 pr-4">Филиал</th><th className="py-2 pr-4">Клиентов</th><th className="py-2 pr-4">Абонементов</th>
                    {data.can_finance && <><th className="py-2 pr-4">Выручка за месяц</th><th className="py-2">Долг</th></>}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byBranch.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4">
                        <button className="font-medium text-slate-900 hover:text-brand" onClick={() => setBranchId(b.id)}>{b.name}</button>
                        {b.address && <div className="text-xs text-slate-400">{b.address}</div>}
                      </td>
                      <td className="py-2.5 pr-4">{b.clients}</td>
                      <td className="py-2.5 pr-4">{b.active_subs}</td>
                      {data.can_finance && <>
                        <td className="py-2.5 pr-4 font-medium text-emerald-600">{money(b.month_income)}</td>
                        <td className="py-2.5">{Number(b.debt) > 0 ? <span className="font-medium text-red-600">{money(b.debt)}</span> : <span className="text-slate-300">—</span>}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {data.can_finance && <Panel title="Последние оплаты" action={<Link to="/admin/finance" className="text-sm text-brand hover:underline">все</Link>}>
          {data.lastPayments.length === 0 ? <Empty text="Оплат пока не было." />
            : <ul className="divide-y divide-slate-100">
              {data.lastPayments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-slate-500">{p.created_at?.slice(0, 10)}</span>
                  <Link to={`/admin/clients/${p.client_id}`} className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-brand">{p.client_name}</Link>
                  {p.branch_name && <span className="hidden rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 sm:inline">{p.branch_name}</span>}
                  <span className="text-xs text-slate-400">{p.method}</span>
                  <span className="font-semibold text-emerald-600">{money(p.amount)}</span>
                </li>
              ))}
            </ul>}
        </Panel>}
      </>}
    </div>
  );
}
