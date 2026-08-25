import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Check, X, Trash2 } from "lucide-react";
import { api, hasPerm } from "../api.js";
import { Header, Panel, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";
import { AddClientModal } from "./Journal.jsx";

const today = () => new Date().toISOString().slice(0, 10);

// Журнал записи: групповые и персональные тренировки на выбранную дату.
export default function PersonalJournal() {
  const [date, setDate] = useState(today());
  const [branches, setBranches] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [fBranch, setFBranch] = useState("");
  const [personal, setPersonal] = useState(null);
  const [group, setGroup] = useState(null);
  const [addPersonal, setAddPersonal] = useState(false);
  const [addGroup, setAddGroup] = useState(false);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ date });
    if (fBranch) p.set("branch_id", fBranch);
    const [pe, gr] = await Promise.all([
      api.get(`/api/personal?${p.toString()}`),
      api.get(`/api/attendance/bookings?${p.toString()}`),
    ]);
    setPersonal(pe); setGroup(gr);
  }, [date, fBranch]);
  useEffect(() => {
    api.get("/api/branches").then(setBranches).catch(() => {});
    api.get("/api/catalog/trainers").then(setTrainers).catch(() => {});
  }, []);
  useEffect(() => { load().catch(() => { setPersonal([]); setGroup([]); }); }, [load]);

  const canMark = hasPerm("attendance_mark");
  const stBadge = (s) => s === "attended" ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">был</span>
    : s === "noshow" ? <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">не пришёл</span>
    : s === "cancelled" ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">отмена</span>
    : <span className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-600">записан</span>;

  return (
    <div className="space-y-5">
      <Header title="Журнал записи" subtitle="Групповые и персональные тренировки на дату" />
      <div className="flex flex-wrap gap-3">
        <input type="date" className={inputCls + " w-auto"} value={date} onChange={(e) => setDate(e.target.value)} />
        <select className={inputCls + " w-auto"} value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="">Все филиалы</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <Panel title="Персональные тренировки"
        action={canMark ? <button className={btnPrimary} onClick={() => setAddPersonal(true)}><Plus size={15} /> Записать</button> : null}>
        {!personal ? <Spinner /> : personal.length === 0 ? <Empty text="Персональных тренировок на эту дату нет." />
          : <ul className="divide-y divide-slate-100 text-sm">
            {personal.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-14 font-semibold tabular-nums text-slate-700">{p.start_time}</span>
                <Link to={`/admin/clients/${p.client_id}`} className="font-medium text-slate-800 hover:text-brand">{p.client_name}</Link>
                <span className="text-slate-400">{p.trainer_name}</span>
                {p.branch_name && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{p.branch_name}</span>}
                {p.note && <span className="text-xs text-slate-400">{p.note}</span>}
                <span className="ml-auto">{stBadge(p.status)}</span>
                {canMark && (
                  <div className="flex gap-1.5">
                    <button title="Был" onClick={async () => { await api.patch(`/api/personal/${p.id}`, { status: p.status === "attended" ? "booked" : "attended" }); load(); }}
                      className={`rounded-lg p-1.5 ${p.status === "attended" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600"}`}><Check size={15} /></button>
                    <button title="Не пришёл" onClick={async () => { await api.patch(`/api/personal/${p.id}`, { status: p.status === "noshow" ? "booked" : "noshow" }); load(); }}
                      className={`rounded-lg p-1.5 ${p.status === "noshow" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600"}`}><X size={15} /></button>
                    <button title="Удалить запись" onClick={async () => { if (confirm("Удалить запись?")) { await api.del(`/api/personal/${p.id}`); load(); } }}
                      className="rounded-lg bg-slate-100 p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>}
      </Panel>

      <Panel title="Записи на групповые занятия"
        action={canMark ? <button className={btnGhost} onClick={() => setAddGroup(true)}><Plus size={15} /> Записать</button> : null}>
        {!group ? <Spinner /> : group.length === 0 ? <Empty text="Разовых записей на группы на эту дату нет." />
          : <ul className="divide-y divide-slate-100 text-sm">
            {group.map((g) => (
              <li key={g.booking_id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-14 font-semibold tabular-nums text-slate-700">{g.start_time}</span>
                <Link to={`/admin/clients/${g.client_id}`} className="font-medium text-slate-800 hover:text-brand">{g.client_name}</Link>
                <span className="text-slate-500">{g.title || g.discipline_name || "Занятие"}</span>
                {g.branch_name && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{g.branch_name}</span>}
                {g.no_sub && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">без абонемента</span>}
                <span className="ml-auto">{stBadge(g.status)}</span>
                {canMark && (
                  <button title="Убрать запись" onClick={async () => { if (confirm("Убрать запись?")) { await api.del(`/api/attendance/bookings/${g.booking_id}`); load(); } }}
                    className="rounded-lg bg-slate-100 p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                )}
              </li>
            ))}
          </ul>}
        <p className="mt-3 text-xs text-slate-400">Отметки «был/не был» по группам ставятся в разделе «Посещаемость» — там виден весь состав занятия.</p>
      </Panel>

      {addPersonal && <PersonalForm date={date} branches={branches} trainers={trainers}
        onClose={() => setAddPersonal(false)} onSaved={() => { setAddPersonal(false); load(); }} />}
      {addGroup && <GroupBookModal date={date} fBranch={fBranch}
        onClose={() => setAddGroup(false)} onSaved={() => { setAddGroup(false); load(); }} />}
    </div>
  );
}

// Запись на персональную тренировку
function PersonalForm({ date, branches, trainers, onClose, onSaved }) {
  const [f, setF] = useState({ date, start_time: "12:00", end_time: "", trainer_id: "", branch_id: "", client_id: null, client_name: "", note: "" });
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!f.client_id) return setErr("Выберите клиента");
    try {
      await api.post("/api/personal", { ...f, branch_id: f.branch_id || null, trainer_id: f.trainer_id || null });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <>
      <Modal title="Запись на персональную тренировку" onClose={onClose}
        footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Записать</button></>}>
        <div className="space-y-4">
          <Field label="Клиент">
            <button className={inputCls + " text-left"} onClick={() => setPick(true)}>
              {f.client_name || <span className="text-slate-400">выбрать клиента…</span>}
            </button>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Время"><input type="time" className={inputCls} value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Тренер">
              <select className={inputCls} value={f.trainer_id} onChange={(e) => setF({ ...f, trainer_id: e.target.value })}>
                <option value="">— выбрать —</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Филиал">
              <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
                <option value="">— не выбран —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Примечание"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        </div>
      </Modal>
      {pick && <AddClientModal title="Клиент для персональной" onClose={() => setPick(false)}
        onPick={(id) => { setPick(false); api.get(`/api/clients/${id}`).then((c) => setF((p) => ({ ...p, client_id: id, client_name: c.name }))); }} />}
    </>
  );
}

// Разовая запись клиента на групповое занятие этой даты
function GroupBookModal({ date, fBranch, onClose, onSaved }) {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [pick, setPick] = useState(false);
  const [client, setClient] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const p = new URLSearchParams({ date });
    if (fBranch) p.set("branch_id", fBranch);
    api.get(`/api/attendance?${p.toString()}`).then((r) => setSessions(r.filter((s) => s.exc_kind !== "cancelled"))).catch(() => {});
  }, [date, fBranch]);
  const save = async () => {
    if (!sessionId || !client) return setErr("Выберите занятие и клиента");
    try { await api.post("/api/attendance/book", { session_id: sessionId, date, client_id: client.id }); onSaved(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <>
      <Modal title={`Запись на групповое занятие (${date.split("-").reverse().join(".")})`} onClose={onClose}
        footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Записать</button></>}>
        <div className="space-y-4">
          <Field label="Занятие">
            <select className={inputCls} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">— выбрать —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.exc_kind === "moved" ? s.new_start : s.start_time)} · {s.title || s.discipline_name || "Занятие"}{s.branch_name ? ` · ${s.branch_name}` : ""}
                </option>
              ))}
            </select>
            {sessions.length === 0 && <span className="mt-1 block text-xs text-slate-400">В этот день занятий нет</span>}
          </Field>
          <Field label="Клиент">
            <button className={inputCls + " text-left"} onClick={() => setPick(true)}>
              {client?.name || <span className="text-slate-400">выбрать клиента…</span>}
            </button>
          </Field>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        </div>
      </Modal>
      {pick && <AddClientModal onClose={() => setPick(false)}
        onPick={(id) => { setPick(false); api.get(`/api/clients/${id}`).then((c) => setClient({ id, name: c.name })); }} />}
    </>
  );
}
