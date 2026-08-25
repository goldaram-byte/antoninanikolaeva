import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Gift, Plus } from "lucide-react";
import { api } from "../api.js";
import { Header, Panel, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";
import { AddClientModal } from "./Journal.jsx";

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");

export default function Loyalty() {
  const [data, setData] = useState(null);
  const [txs, setTxs] = useState(null);
  const [adjust, setAdjust] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([api.get("/api/loyalty/summary"), api.get("/api/loyalty/transactions")]);
    setData(s); setTxs(t);
  }, []);
  useEffect(() => { load().catch(() => { setData({ points_total: 0, holders: 0, leaders: [] }); setTxs([]); }); }, [load]);

  if (!data) return <Spinner />;
  return (
    <div className="space-y-5">
      <Header title="Лояльность" subtitle="Баллы клиентов и рейтинг приглашений"
        action={<button className={btnPrimary} onClick={() => setAdjust(true)}><Plus size={15} /> Корректировка баллов</button>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Баллов на руках" value={data.points_total} />
        <Stat label="Клиентов с баллами" value={data.holders} />
        <Stat label="Бонус пригласившему" value={`${data.referral_percent ?? "0"}%`} hint="меняется в Настройках" />
      </div>

      <Panel title="Рейтинг приглашений">
        {data.leaders.length === 0 ? <Empty text="Пока никто никого не пригласил. Реферальный код клиента — в его карточке." />
          : <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="py-2 pr-4">№</th><th className="py-2 pr-4">Клиент</th><th className="py-2 pr-4">Филиал</th><th className="py-2 pr-4">Пригласил всего</th><th className="py-2 pr-4">Пришли и оплатили</th><th className="py-2 text-right">Начислено баллов</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.leaders.map((l, i) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 text-slate-400">{i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <Link to={`/admin/clients/${l.id}`} className="font-medium text-slate-800 hover:text-brand">{l.name}</Link>
                      <span className="block text-xs text-slate-400">{l.referral_code}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">{l.branch_name || "—"}</td>
                    <td className="py-2.5 pr-4">{l.invited_total}</td>
                    <td className="py-2.5 pr-4 font-semibold text-emerald-600">{l.invited_paid}</td>
                    <td className="py-2.5 text-right font-semibold text-slate-800">{l.reward_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        <p className="mt-3 text-xs text-slate-400">Приглашённый засчитывается в «пришли и оплатили», только когда у него есть оплаченный абонемент. Награда начисляется автоматически при первой покупке.</p>
      </Panel>

      <Panel title="Последние операции с баллами">
        {!txs ? <Spinner /> : txs.length === 0 ? <Empty text="Операций с баллами ещё не было." />
          : <ul className="divide-y divide-slate-100 text-sm">
            {txs.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-slate-500">{fmtDate(t.created_at)}</span>
                <Link to={`/admin/clients/${t.client_id}`} className="font-medium text-slate-800 hover:text-brand">{t.client_name}</Link>
                <span className="min-w-0 flex-1 truncate text-slate-500">{t.reason}</span>
                <span className={`font-semibold ${t.points > 0 ? "text-emerald-600" : "text-red-500"}`}>{t.points > 0 ? "+" : ""}{t.points}</span>
              </li>
            ))}
          </ul>}
      </Panel>

      {adjust && <AdjustModal onClose={() => setAdjust(false)} onDone={() => { setAdjust(false); load(); }} />}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-sm text-slate-500">{label}<Gift size={16} className="text-brand" /></div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

// Ручная корректировка баллов клиента (с записью в историю)
function AdjustModal({ onClose, onDone }) {
  const [client, setClient] = useState(null);
  const [pick, setPick] = useState(false);
  const [f, setF] = useState({ mode: "add", points: "", reason: "" });
  const [err, setErr] = useState("");
  const save = async () => {
    if (!client) return setErr("Выберите клиента");
    const pts = Math.abs(Math.trunc(Number(f.points)));
    if (!pts) return setErr("Укажите количество баллов");
    try {
      await api.post("/api/loyalty/adjust", { client_id: client.id, points: f.mode === "add" ? pts : -pts, reason: f.reason });
      onDone();
    } catch (e) { setErr(e.message); }
  };
  return (
    <>
      <Modal title="Корректировка баллов" onClose={onClose}
        footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Провести</button></>}>
        <div className="space-y-4">
          <Field label="Клиент">
            <button className={inputCls + " text-left"} onClick={() => setPick(true)}>
              {client ? `${client.name} · баллов: ${client.bonus_points}` : <span className="text-slate-400">выбрать клиента…</span>}
            </button>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Действие">
              <select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                <option value="add">Начислить (+)</option>
                <option value="sub">Списать (−)</option>
              </select>
            </Field>
            <Field label="Баллы"><input type="number" min="1" className={inputCls} value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></Field>
          </div>
          <Field label="Причина"><input className={inputCls} placeholder="напр. подарок за соревнования" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        </div>
      </Modal>
      {pick && <AddClientModal title="Клиент для корректировки" onClose={() => setPick(false)}
        onPick={(id) => { setPick(false); api.get(`/api/clients/${id}`).then((c) => setClient({ id, name: c.name, bonus_points: c.bonus_points })); }} />}
    </>
  );
}
