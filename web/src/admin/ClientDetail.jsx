import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Phone, MessageCircle, Send, Plus, Pencil, Ticket, Wallet, ClipboardCheck } from "lucide-react";
import { api, hasPerm, waLink, tgLink, telLink } from "../api.js";
import { Header, Panel, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost, money } from "../ui.jsx";
import { ClientForm } from "./Clients.jsx";
import BuyModal from "./BuyModal.jsx";
import PaymentModal from "./PaymentModal.jsx";
import { WEEKDAYS } from "./Schedule.jsx";

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");
const GENDERS = { m: "Мужской", f: "Женский" };

// Возраст по дате рождения — в детской школе так удобнее подбирать группу
function age(birthdate) {
  if (!birthdate) return null;
  const b = new Date(String(birthdate).slice(0, 10));
  if (isNaN(b)) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}
const years = (n) => {
  const t = n % 100, o = n % 10;
  if (t > 10 && t < 20) return "лет";
  if (o === 1) return "год";
  if (o >= 2 && o <= 4) return "года";
  return "лет";
};

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [branches, setBranches] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [disc, setDisc] = useState([]);
  const [edit, setEdit] = useState(false);
  const [buy, setBuy] = useState(false);
  const [pay, setPay] = useState(null);          // абонемент, по которому принимаем оплату (или null)
  const [groups, setGroups] = useState(false);   // окно выбора групп

  const load = useCallback(async () => setC(await api.get(`/api/clients/${id}`)), [id]);
  useEffect(() => {
    load().catch(() => nav("/admin/clients"));
    api.get("/api/branches").then(setBranches).catch(() => {});
    api.get("/api/catalog/trainers").then(setTrainers).catch(() => {});
    api.get("/api/catalog/disciplines").then(setDisc).catch(() => {});
  }, [load, nav]);

  const toggleStatus = async () => {
    await api.put(`/api/clients/${id}/status`, { status: c.status === "inactive" ? "active" : "inactive" });
    load();
  };

  if (!c) return <Spinner />;
  const debt = (c.subs || []).reduce((a, s) => a + Math.max(0, Number(s.price) - Number(s.paid)), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/admin/clients" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-800"><ArrowLeft size={16} /></Link>
        <Header title={c.name} subtitle={[c.branch_name, (c.trainers || []).map((t) => t.name).join(", ")].filter(Boolean).join(" · ") || "без привязок"} />
        {c.status === "inactive"
          ? <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Неактивный</span>
          : <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600">Активный</span>}
        {hasPerm("clients_edit") && (
          <div className="ml-auto flex gap-2">
            <button className={btnGhost} onClick={toggleStatus}>
              {c.status === "inactive" ? "Вернуть в активные" : "Сделать неактивным"}
            </button>
            <button className={btnGhost} onClick={() => setEdit(true)}><Pencil size={15} /> Редактировать</button>
          </div>
        )}
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
        {debt > 0 && <span className="ml-auto rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600">Долг: {money(debt)}</span>}
      </div>

      {/* Родитель — по нему чаще всего и связываются */}
      {(c.parent_phone || c.parent_name) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Родитель{c.parent_name ? `: ` : ""}</span>
          {c.parent_name && <span className="font-medium text-slate-700">{c.parent_name}</span>}
          {c.parent_phone && (
            <>
              <span className="font-medium text-slate-700">{c.parent_phone}</span>
              <a href={telLink(c.parent_phone)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50"><Phone size={14} /> Позвонить</a>
              <a href={waLink(c.parent_phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-white hover:bg-emerald-600"><MessageCircle size={14} /> WhatsApp</a>
              <a href={tgLink(c.parent_phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-white hover:bg-sky-600"><Send size={14} /> Telegram</a>
            </>
          )}
        </div>
      )}

      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Филиал" value={c.branch_name || "—"} />
        <Info label="Направления" value={(c.disciplines || []).map((d) => d.name).join(", ") || "—"} />
        <Info label="Скидка" value={Number(c.discount_percent) > 0 ? `${Number(c.discount_percent)}%` : "—"} />
        <Info label="Баллы" value={c.bonus_points || 0} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Info label="Дата рождения" value={c.birthdate ? `${fmtDate(c.birthdate)} · ${age(c.birthdate)} ${years(age(c.birthdate))}` : "—"} />
        <Info label="Пол" value={GENDERS[c.gender] || "—"} />
        <Info label="Ответственный" value={c.manager_name || "—"} />
        <Info label="Источник" value={c.source || "—"} />
        <Info label="В базе с" value={fmtDate(c.created_at)} />
      </div>
      {c.referredByName && <p className="text-xs text-slate-400">Пригласил(а): {c.referredByName}</p>}
      {c.notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{c.notes}</p>}

      {/* Группы, за которыми закреплён клиент */}
      <Panel title="Группы (расписание)"
        action={hasPerm("clients_edit") ? <button className={btnGhost} onClick={() => setGroups(true)}>Изменить</button> : null}>
        {(c.groups || []).length === 0 ? <Empty text="Клиент не закреплён ни за одной группой." />
          : <ul className="divide-y divide-slate-100 text-sm">
            {c.groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-8 font-semibold text-slate-700">{WEEKDAYS[g.day_of_week]}</span>
                <span className="tabular-nums text-slate-600">{g.start_time}–{g.end_time}</span>
                <span className="font-medium text-slate-800">{g.title || g.discipline_name || "Занятие"}</span>
                {g.branch_name && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{g.branch_name}</span>}
                {g.trainer_name && <span className="text-xs text-slate-400">{g.trainer_name}</span>}
              </li>
            ))}
          </ul>}
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
                    {owed > 0 && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">долг {money(owed)}</span>}
                    {(expired || usedUp) && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-500">{expired ? "истёк" : "занятия кончились"}</span>}
                    <span className="ml-auto text-sm font-semibold text-slate-700">{money(s.price)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{fmtDate(s.purchase_date)} — {fmtDate(s.expiry_date)}</span>
                    <span>{s.kind === "unlimited" ? "безлимит" : `занятий: ${s.sessions_used} / ${s.sessions_total}`}</span>
                    <span>оплачено: {money(s.paid)}</span>
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
                  ? <span className="font-semibold text-red-500">−{money(p.amount)}</span>
                  : <span className="font-semibold text-emerald-600">{money(p.amount)}</span>}
              </li>
            ))}
          </ul>}
      </Panel>

      {/* История посещений (групповые + персональные) */}
      <Panel title="История посещений">
        {(c.visits || []).length === 0
          ? <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><ClipboardCheck size={16} /> Посещений пока не было.</div>
          : <ul className="divide-y divide-slate-100 text-sm">
            {c.visits.map((v, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-24 shrink-0 text-slate-500">{fmtDate(v.date)}</span>
                <span className="tabular-nums text-slate-500">{v.start_time}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{v.title}</span>
                {v.kind === "personal" && <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-600">персон.</span>}
                {v.no_sub && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">без абонемента</span>}
                {v.status === "attended" ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">был</span>
                  : v.status === "noshow" ? <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">не пришёл</span>
                  : <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-600">запись</span>}
              </li>
            ))}
          </ul>}
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
      {groups && <GroupsModal client={c} onClose={() => setGroups(false)} onSaved={() => { setGroups(false); load(); }} />}
    </div>
  );
}

// Выбор групп расписания, за которыми закреплён клиент
function GroupsModal({ client, onClose, onSaved }) {
  const [sessions, setSessions] = useState([]);
  const [picked, setPicked] = useState((client.groups || []).map((g) => g.id));
  useEffect(() => { api.get("/api/schedule").then(setSessions).catch(() => {}); }, []);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = async () => { await api.put(`/api/clients/${client.id}/sessions`, { session_ids: picked }); onSaved(); };
  return (
    <Modal title="Группы клиента" onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      {sessions.length === 0 ? <Empty text="В расписании пока нет занятий — создайте их в разделе «Расписание»." />
        : <ul className="max-h-80 space-y-1.5 overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                <span className="w-8 font-semibold text-slate-700">{WEEKDAYS[s.day_of_week]}</span>
                <span className="tabular-nums text-slate-500">{s.start_time}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{s.title || s.discipline_name || "Занятие"}</span>
                {s.branch_name && <span className="text-xs text-slate-400">{s.branch_name}</span>}
              </label>
            </li>
          ))}
        </ul>}
    </Modal>
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
