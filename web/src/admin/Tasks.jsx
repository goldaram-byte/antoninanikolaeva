import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api.js";
import { Header, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";
import { AddClientModal } from "./Journal.jsx";

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");
const today = () => new Date().toISOString().slice(0, 10);

// Задачи по клиентам и лидам воронки в одном списке
export default function Tasks() {
  const [tab, setTab] = useState("open");        // open | done
  const [list, setList] = useState(null);
  const [add, setAdd] = useState(false);

  const load = useCallback(async () => {
    setList(await api.get(`/api/tasks?done=${tab === "done" ? 1 : 0}`));
  }, [tab]);
  useEffect(() => { load().catch(() => setList([])); }, [load]);

  const toggle = async (t, done) => { await api.patch(`/api/tasks/${t.kind}/${t.id}`, { done }); load(); };
  const remove = async (t) => { if (confirm("Удалить задачу?")) { await api.del(`/api/tasks/${t.kind}/${t.id}`); load(); } };

  return (
    <div className="space-y-5">
      <Header title="Задачи" subtitle="По клиентам и заявкам воронки"
        action={<button className={btnPrimary} onClick={() => setAdd(true)}><Plus size={16} /> Задача</button>} />

      <div className="flex gap-1 border-b border-slate-200">
        {[{ id: "open", label: "Открытые" }, { id: "done", label: "Выполненные" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!list ? <Spinner /> : list.length === 0 ? <Empty text={tab === "open" ? "Открытых задач нет." : "Выполненных задач нет."} /> : (
        <div className="rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {list.map((t) => {
              const overdue = !t.done && t.due_date && t.due_date.slice(0, 10) < today();
              return (
                <li key={t.kind + t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={t.done} onChange={(e) => toggle(t, e.target.checked)} />
                  <span className={`min-w-0 flex-1 ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {t.title}
                    {t.note && <span className="block text-xs text-slate-400">{t.note}</span>}
                  </span>
                  {t.kind === "client"
                    ? <Link to={`/admin/clients/${t.target_id}`} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:text-brand">{t.target_name}</Link>
                    : <Link to="/admin/funnel" className="rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-600">заявка: {t.target_name}</Link>}
                  {t.due_date && <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>до {fmtDate(t.due_date)}</span>}
                  {t.author && <span className="text-xs text-slate-300">{t.author}</span>}
                  <button onClick={() => remove(t)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {add && <TaskForm onClose={() => setAdd(false)} onSaved={() => { setAdd(false); setTab("open"); load(); }} />}
    </div>
  );
}

function TaskForm({ onClose, onSaved }) {
  const [client, setClient] = useState(null);
  const [pick, setPick] = useState(false);
  const [f, setF] = useState({ title: "", due_date: "", note: "" });
  const [err, setErr] = useState("");
  const save = async () => {
    if (!client) return setErr("Выберите клиента");
    if (!f.title.trim()) return setErr("Укажите название задачи");
    try { await api.post("/api/tasks", { client_id: client.id, ...f }); onSaved(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <>
      <Modal title="Новая задача по клиенту" onClose={onClose}
        footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Создать</button></>}>
        <div className="space-y-4">
          <Field label="Клиент">
            <button className={inputCls + " text-left"} onClick={() => setPick(true)}>
              {client?.name || <span className="text-slate-400">выбрать клиента…</span>}
            </button>
          </Field>
          <Field label="Что сделать"><input className={inputCls} value={f.title} placeholder="напр. Напомнить про продление" onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Срок"><input type="date" className={inputCls} value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
            <Field label="Заметка"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-slate-400">Задачи по заявкам создаются в карточке заявки в «Воронке продаж».</p>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        </div>
      </Modal>
      {pick && <AddClientModal title="Клиент для задачи" onClose={() => setPick(false)}
        onPick={(id) => { setPick(false); api.get(`/api/clients/${id}`).then((c) => setClient({ id, name: c.name })); }} />}
    </>
  );
}
