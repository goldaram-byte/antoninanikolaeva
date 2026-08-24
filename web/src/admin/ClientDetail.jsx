import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Phone, MessageCircle, Send, Plus, Pencil, Ticket, Wallet, ClipboardCheck } from "lucide-react";
import { api, hasPerm, waLink, tgLink, telLink } from "../api.js";
import { useSettings } from "../settings.jsx";
import { Header, Panel, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost, money } from "../ui.jsx";
import { ClientForm } from "./Clients.jsx";
import BuyModal from "./BuyModal.jsx";
import PaymentModal from "./PaymentModal.jsx";

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { currency } = useSettings();
  const [c, setC] = useState(null);
  const [branches, setBranches] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [disc, setDisc] = useState([]);
  const [edit, setEdit] = useState(false);
  const [buy, setBuy] = useState(false);
  const [pay, setPay] = useState(null);          // абонемент, по которому принимаем оплату (или null)

  const load = useCallback(async () => setC(await api.get(`/api/clients/${id}`)), [id]);
  useEffect(() => {
    load().catch(() => nav("/admin/clients"));
    api.get("/api/branches").then(setBranches).catch(() => {});
    api.get("/api/catalog/trainers").then(setTrainers).catch(() => {});
    api.get("/api/catalog/disciplines").then(setDisc).catch(() => {});
  }, [load, nav]);

  if (!c) return <Spinner />;
  const debt = (c.subs || []).reduce((a, s) => a + Math.max(0, Number(s.price) - Number(s.paid)), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/admin/clients" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /></Link>
        <Header title={c.name} subtitle={[c.branch_name, (c.trainers || []).map((t) => t.name).join(", ")].filter(Boolean).join(" · ") || "без привязок"} />
        {hasPerm("clients_edit") && <button className={btnGhost + " ml-auto"} onClick={() => setEdit(true)}><Pencil size={15} /> Редактировать</button>}
      </div>

      {/* Контакты и переход в мессенджеры */}
      <div className="flex flex-wrap items-center gap-2">
        {c.phone ? (
          <>
            <span className="text-sm font-medium text-slate-700">{c.phone}</span>
            <a href={telLink(c.phone)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><Phone size={14} /> Позвонить</a>
            <a href={waLink(c.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"><MessageCircle size={14} /> WhatsApp</a>
            <a href={tgLink(c.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm text-white hover:bg-sky-600"><Send size={14} /> Telegram</a>
          </>
        ) : <span className="text-sm text-slate-400">Телефон не указан</span>}
        {debt > 0 && <span className="ml-auto rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600">Долг: {money(debt, currency)}</span>}
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Филиал" value={c.branch_name || "—"} />
        <Info label="Направления" value={(c.disciplines || []).map((d) => d.name).join(", ") || "—"} />
        <Info label="Скидка" value={Number(c.discount_percent) > 0 ? `${Number(c.discount_percent)}%` : "—"} />
        <Info label="Баллы" value={c.bonus_points || 0} />
      </div>
      {c.referredByName && <p className="text-xs text-slate-400">Пригласил(а): {c.referredByName}</p>}
      {c.notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{c.notes}</p>}

      {/* Группы — появятся вместе с расписанием */}
      <Panel title="Группы (расписание)">
        <Empty text="Привязка к группам появится на этапе 3 вместе с расписанием." />
      </Panel>

      {/* Абонементы */}
      <Panel title="Абонементы" action={hasPerm("subs_manage") ? <button className={btnPrimary} onClick={() => setBuy(true)}><Plus size={15} /> Выдать</button> : null}>
        {(c.subs || []).length === 0 ? <Empty text="Абонементов ещё не было." />
          : <div className="space-y-2">
            {c.subs.map((s) => {
              const owed = Math.max(0, Number(s.price) - Number(s.paid));
              const expired = new Date(s.expiry_date) < new Date(new Date().toDateString());
              const usedUp = s.kind !== "unlimited" && s.sessions_used >= s.sessions_total;
              return (
                <div key={s.id} className={`rounded-xl border p-3 ${expired || usedUp ? "border-slate-100 bg-slate-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Ticket size={16} className={expired || usedUp ? "text-slate-300" : "text-brand"} />
                    <span className="font-medium text-slate-900">{s.name}</span>
                    {s.branch_name && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{s.branch_name}</span>}
                    {s.trainer_name && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{s.trainer_name}</span>}
                    {owed > 0 && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">долг {money(owed, currency)}</span>}
                    {(expired || usedUp) && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-500">{expired ? "истёк" : "занятия кончились"}</span>}
                    <span className="ml-auto text-sm font-semibold text-slate-700">{money(s.price, currency)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{fmtDate(s.purchase_date)} — {fmtDate(s.expiry_date)}</span>
                    <span>{s.kind === "unlimited" ? "безлимит" : `занятий: ${s.sessions_used} / ${s.sessions_total}`}</span>
                    <span>оплачено: {money(s.paid, currency)}</span>
                    {owed > 0 && hasPerm("payments_manage") && (
                      <button className="ml-auto font-medium text-brand hover:underline" onClick={() => setPay(s)}>Принять оплату</button>
                    )}
                    {hasPerm("subs_manage") && (
                      <button className="text-slate-400 hover:text-red-500" onClick={async () => {
                        if (!confirm(`Удалить абонемент «${s.name}»?`)) return;
                        try { await api.del(`/api/subscriptions/${s.id}`); }
                        catch (e) { if (e.message.includes("оплаты")) { if (confirm(e.message)) await api.del(`/api/subscriptions/${s.id}?force=1`); else return; } else return alert(e.message); }
                        load();
                      }}>удалить</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>}
      </Panel>

      {/* История оплат */}
      <Panel title="История оплат" action={debt > 0 && hasPerm("payments_manage") ? <button className={btnGhost} onClick={() => setPay({})}><Wallet size={15} /> Принять оплату</button> : null}>
        {(c.payments || []).length === 0 ? <Empty text="Оплат ещё не было." />
          : <ul className="divide-y divide-slate-100 text-sm">
            {c.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-slate-500">{fmtDate(p.created_at)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{p.note || "оплата"}</span>
                <span className="text-xs text-slate-400">{p.method}</span>
                {p.op_type === "refund"
                  ? <span className="font-semibold text-red-500">−{money(p.amount, currency)}</span>
                  : <span className="font-semibold text-emerald-600">{money(p.amount, currency)}</span>}
              </li>
            ))}
          </ul>}
      </Panel>

      {/* История посещений */}
      <Panel title="История посещений">
        {(c.visits || []).length === 0
          ? <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><ClipboardCheck size={16} /> Посещения появятся на этапе 3 вместе с расписанием и отметкой посещаемости.</div>
          : null}
      </Panel>

      {/* История баллов */}
      {(c.loyalty || []).length > 0 && (
        <Panel title="История баллов">
          <ul className="divide-y divide-slate-100 text-sm">
            {c.loyalty.map((l, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-slate-500">{fmtDate(l.created_at)}</span>
                <span className="flex-1 text-slate-600">{l.reason}</span>
                <span className={l.points > 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>{l.points > 0 ? "+" : ""}{l.points}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {edit && <ClientForm client={c} branches={branches} trainers={trainers} disc={disc}
        onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load().catch(() => nav("/admin/clients")); }} />}
      {buy && <BuyModal client={c} branches={branches} trainers={trainers}
        onClose={() => setBuy(false)} onDone={() => { setBuy(false); load(); }} />}
      {pay && <PaymentModal client={c} sub={pay.id ? pay : null}
        onClose={() => setPay(null)} onDone={() => { setPay(null); load(); }} />}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}
