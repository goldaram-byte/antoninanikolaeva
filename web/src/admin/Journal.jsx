import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Check, X, UserPlus, Trash2 } from "lucide-react";
import { api, hasPerm } from "../api.js";
import { Header, Empty, Spinner, Modal, inputCls, btnPrimary, btnGhost } from "../ui.jsx";

const today = () => new Date().toISOString().slice(0, 10);

// Посещаемость: занятия дня, состав = закреплённые в группе + записавшиеся на дату.
// «Был» списывает занятие с абонемента, снятие отметки возвращает. Отмечают тренер и администратор.
export default function Journal() {
  const [date, setDate] = useState(today());
  const [branches, setBranches] = useState([]);
  const [fBranch, setFBranch] = useState("");
  const [sessions, setSessions] = useState(null);
  const [open, setOpen] = useState({});          // раскрытые занятия
  const [addTo, setAddTo] = useState(null);      // занятие, куда добавляем клиента

  const load = useCallback(async () => {
    const p = new URLSearchParams({ date });
    if (fBranch) p.set("branch_id", fBranch);
    setSessions(await api.get(`/api/attendance?${p.toString()}`));
  }, [date, fBranch]);
  useEffect(() => { api.get("/api/branches").then(setBranches).catch(() => {}); }, []);
  useEffect(() => { load().catch(() => setSessions([])); }, [load]);

  const canMark = hasPerm("attendance_mark");
  const mark = async (s, clientId, status) => {
    await api.post("/api/attendance/mark", { session_id: s.id, date, client_id: clientId, status });
    load();
  };

  return (
    <div className="space-y-5">
      <Header title="Посещаемость" subtitle="Отметка «был/не был» по занятиям дня" />
      <div className="flex flex-wrap gap-3">
        <input type="date" className={inputCls + " w-auto"} value={date} onChange={(e) => setDate(e.target.value)} />
        <select className={inputCls + " w-auto"} value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="">Все филиалы</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {!sessions ? <Spinner /> : sessions.length === 0 ? <Empty text="В этот день занятий нет." /> : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const cancelled = s.exc_kind === "cancelled";
            const start = s.exc_kind === "moved" ? s.new_start : s.start_time;
            const end = s.exc_kind === "moved" ? (s.new_end || s.end_time) : s.end_time;
            const attended = s.roster.filter((r) => r.status === "attended").length;
            return (
              <div key={s.id} className={`rounded-xl border bg-white ${cancelled ? "border-red-100 opacity-70" : "border-slate-200"}`}>
                <button className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
                  onClick={() => setOpen((p) => ({ ...p, [s.id]: !p[s.id] }))}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.discipline_color || "#DC2626" }} />
                  <span className="font-semibold tabular-nums text-slate-800">{start}–{end}</span>
                  <span className="font-medium text-slate-700">{s.title || s.discipline_name || "Занятие"}</span>
                  {s.branch_name && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{s.branch_name}</span>}
                  {s.trainer_name && <span className="text-xs text-slate-400">{s.trainer_name}</span>}
                  {cancelled && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">отменено{s.exc_note ? `: ${s.exc_note}` : ""}</span>}
                  {s.exc_kind === "moved" && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">перенос</span>}
                  <span className="ml-auto text-sm text-slate-500">{attended} / {s.roster.length}</span>
                </button>
                {open[s.id] && !cancelled && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {s.roster.length === 0 && <Empty text="В группе никого нет. Закрепите клиентов в их карточках или добавьте разово." />}
                    <ul className="divide-y divide-slate-50">
                      {s.roster.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 py-2">
                          <Link to={`/admin/clients/${r.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 hover:text-brand">{r.name}</Link>
                          {!r.fixed && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-600">запись</span>}
                          {r.no_sub && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">без абонемента (долг)</span>}
                          {canMark && (
                            <div className="flex gap-1.5">
                              <button title="Был" onClick={() => mark(s, r.id, r.status === "attended" ? "booked" : "attended")}
                                className={`rounded-lg p-1.5 ${r.status === "attended" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600"}`}><Check size={15} /></button>
                              <button title="Не пришёл" onClick={() => mark(s, r.id, r.status === "noshow" ? "booked" : "noshow")}
                                className={`rounded-lg p-1.5 ${r.status === "noshow" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600"}`}><X size={15} /></button>
                              {!r.fixed && r.booking_id && (
                                <button title="Убрать запись" onClick={async () => { await api.del(`/api/attendance/bookings/${r.booking_id}`); load(); }}
                                  className="rounded-lg bg-slate-100 p-1.5 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    {canMark && (
                      <button className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand hover:underline" onClick={() => setAddTo(s)}>
                        <UserPlus size={15} /> Добавить клиента разово
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addTo && <AddClientModal onClose={() => setAddTo(null)} onPick={async (clientId) => {
        await api.post("/api/attendance/book", { session_id: addTo.id, date, client_id: clientId });
        setAddTo(null); load();
      }} />}
    </div>
  );
}

// Поиск клиента для разовой записи
export function AddClientModal({ onClose, onPick, title = "Добавить клиента" }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/api/clients?search=${encodeURIComponent(q)}`).then((r) => setList(r.slice(0, 12))).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title={title} onClose={onClose} footer={<button className={btnGhost} onClick={onClose}>Закрыть</button>}>
      <input className={inputCls} placeholder="Поиск по имени или телефону" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto">
        {list.map((c) => (
          <li key={c.id}>
            <button className="flex w-full items-center justify-between px-2 py-2.5 text-left text-sm hover:bg-slate-50" onClick={() => onPick(c.id)}>
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-400">{c.phone || ""}{c.branch_name ? ` · ${c.branch_name}` : ""}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-4 text-center text-sm text-slate-400">Никого не нашлось</li>}
      </ul>
    </Modal>
  );
}
