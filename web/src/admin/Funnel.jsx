import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Phone, ChevronLeft, ChevronRight, Trash2, UserCheck, ListChecks, Settings2, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "../api.js";
import { Header, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";

const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");

// Настройка этапов воронки: добавить, переименовать, перекрасить,
// поменять местами, назначить этап «успех»/«отказ», удалить пустой.
function StagesModal({ stages, onClose, onChanged }) {
  const [list, setList] = useState(stages);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => { const st = await api.get("/api/funnel/stages"); setList(st); onChanged(); };
  const run = async (fn) => {
    setErr(""); setBusy(true);
    try { await fn(); await refresh(); } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const add = () => {
    if (!name.trim()) return setErr("Введите название этапа");
    run(async () => { await api.post("/api/funnel/stages", { name: name.trim(), color }); setName(""); });
  };
  const rename = (st, value) => {
    if (!value.trim() || value.trim() === st.name) return;
    run(() => api.put(`/api/funnel/stages/${st.id}`, { name: value.trim() }));
  };
  const setKind = (st, kind) =>
    run(() => api.put(`/api/funnel/stages/${st.id}`, { is_won: kind === "won", is_lost: kind === "lost" }));
  const move = (i, dir) => {
    const next = [...list];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    run(() => api.post("/api/funnel/stages/reorder", { ids: next.map((x) => x.id) }));
  };
  const remove = (st) => {
    if (!confirm(`Удалить этап «${st.name}»?`)) return;
    run(() => api.del(`/api/funnel/stages/${st.id}`));
  };

  return (
    <Modal title="Этапы воронки" onClose={onClose}
      footer={<button className={btnPrimary} onClick={onClose}>Готово</button>}>
      <div className="space-y-3">
        <div className="space-y-2">
          {list.map((st, i) => (
            <div key={st.id} className="flex items-center gap-2">
              <input type="color" className="h-9 w-9 shrink-0 cursor-pointer rounded border border-slate-200"
                value={st.color} onChange={(e) => run(() => api.put(`/api/funnel/stages/${st.id}`, { color: e.target.value }))} />
              <input className={inputCls} defaultValue={st.name} onBlur={(e) => rename(st, e.target.value)} />
              <select className={inputCls + " w-36 shrink-0"} value={st.is_won ? "won" : st.is_lost ? "lost" : "normal"}
                onChange={(e) => setKind(st, e.target.value)}>
                <option value="normal">обычный</option>
                <option value="won">успех</option>
                <option value="lost">отказ</option>
              </select>
              <button className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === 0 || busy}
                onClick={() => move(i, -1)} title="Левее"><ArrowUp size={15} /></button>
              <button className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === list.length - 1 || busy}
                onClick={() => move(i, 1)} title="Правее"><ArrowDown size={15} /></button>
              <button className="p-1 text-slate-400 hover:text-red-600" disabled={busy}
                onClick={() => remove(st)} title="Удалить"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          <input type="color" className="h-9 w-9 shrink-0 cursor-pointer rounded border border-slate-200"
            value={color} onChange={(e) => setColor(e.target.value)} />
          <input className={inputCls} placeholder="Новый этап, например «Пробное занятие»"
            value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className={btnPrimary} disabled={busy} onClick={add}><Plus size={16} /> Добавить</button>
        </div>

        <p className="text-xs text-slate-400">
          Порядок этапов — как они идут слева направо на доске. «Успех» — этап, на который заявка
          попадает при кнопке «Сделать клиентом» (такой этап один), «отказ» — этап потерянных заявок.
          Удалить можно только пустой этап: сначала перенесите заявки.
        </p>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

// Воронка продаж: заявки → этапы → конверсия в клиента одним действием
// (с переносом «кто пригласил» и направления — критичное требование ТЗ).
export default function Funnel() {
  const [stages, setStages] = useState([]);
  const [leads, setLeads] = useState(null);
  const [branches, setBranches] = useState([]);
  const [disc, setDisc] = useState([]);
  const [fBranch, setFBranch] = useState("");
  const [add, setAdd] = useState(false);
  const [openLead, setOpenLead] = useState(null);
  const [stagesOpen, setStagesOpen] = useState(false);

  const load = useCallback(async () => {
    const p = fBranch ? `?branch_id=${fBranch}` : "";
    const [st, ld] = await Promise.all([api.get("/api/funnel/stages"), api.get(`/api/funnel/leads${p}`)]);
    setStages(st); setLeads(ld);
  }, [fBranch]);
  useEffect(() => {
    api.get("/api/branches").then(setBranches).catch(() => {});
    api.get("/api/catalog/disciplines").then(setDisc).catch(() => {});
  }, []);
  useEffect(() => { load().catch(() => setLeads([])); }, [load]);

  const move = async (lead, dir) => {
    const idx = stages.findIndex((s) => s.id === lead.stage_id);
    const next = stages[idx + dir];
    if (!next) return;
    await api.post(`/api/funnel/leads/${lead.id}/move`, { stage_id: next.id });
    load();
  };

  return (
    <div className="space-y-5">
      <Header title="Воронка продаж" subtitle="Заявки и лиды по этапам"
        action={
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => setStagesOpen(true)}><Settings2 size={15} /> Этапы</button>
            <button className={btnPrimary} onClick={() => setAdd(true)}><Plus size={16} /> Заявка</button>
          </div>
        } />

      <select className={inputCls + " w-auto"} value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
        <option value="">Все филиалы</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>

      {!leads ? <Spinner /> : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((st) => {
            const items = leads.filter((l) => l.stage_id === st.id);
            return (
              <div key={st.id} className="w-64 shrink-0 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.color }} />
                  <span className="text-sm font-semibold text-slate-700">{st.name}</span>
                  <span className="ml-auto text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2">
                  {items.length === 0 && <div className="py-4 text-center text-xs text-slate-300">пусто</div>}
                  {items.map((l) => (
                    <div key={l.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-sm">
                      <button className="w-full text-left font-medium text-slate-800 hover:text-brand" onClick={() => setOpenLead(l)}>{l.name}</button>
                      {l.phone && <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Phone size={11} /> {l.phone}</div>}
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-400">
                        {l.branch_name && <span className="rounded bg-white px-1.5 py-0.5">{l.branch_name}</span>}
                        {l.discipline_name && <span className="rounded bg-white px-1.5 py-0.5">{l.discipline_name}</span>}
                        {l.referrer_name && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600">от: {l.referrer_name}</span>}
                        {l.open_tasks > 0 && <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-sky-600"><ListChecks size={10} /> {l.open_tasks}</span>}
                        {l.client_id && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600">клиент ✓</span>}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-slate-300">{fmtDate(l.created_at)}</span>
                        <span className="flex gap-1">
                          <button className="rounded p-1 text-slate-300 hover:bg-white hover:text-slate-600" onClick={() => move(l, -1)}><ChevronLeft size={14} /></button>
                          <button className="rounded p-1 text-slate-300 hover:bg-white hover:text-slate-600" onClick={() => move(l, 1)}><ChevronRight size={14} /></button>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stagesOpen && <StagesModal stages={stages} onClose={() => setStagesOpen(false)} onChanged={load} />}
      {add && <LeadForm branches={branches} disc={disc} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load(); }} />}
      {openLead && <LeadModal lead={openLead} stages={stages} branches={branches} disc={disc}
        onClose={() => setOpenLead(null)} onChanged={() => { setOpenLead(null); load(); }} />}
    </div>
  );
}

function LeadForm({ branches, disc, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", phone: "", branch_id: "", discipline_id: "", comment: "", referral_code: "" });
  const [err, setErr] = useState("");
  const save = async () => {
    try { await api.post("/api/funnel/leads", { ...f, branch_id: f.branch_id || null, discipline_id: f.discipline_id || null }); onSaved(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Новая заявка" onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Создать</button></>}>
      <div className="space-y-4">
        <Field label="Имя"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон"><input className={inputCls} placeholder="+7…" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Филиал">
            <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Направление">
            <select className={inputCls} value={f.discipline_id} onChange={(e) => setF({ ...f, discipline_id: e.target.value })}>
              <option value="">— не выбрано —</option>
              {disc.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Код пригласившего"><input className={inputCls} placeholder="REF…" value={f.referral_code} onChange={(e) => setF({ ...f, referral_code: e.target.value })} /></Field>
        </div>
        <Field label="Комментарий"><textarea className={inputCls} rows={2} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></Field>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

// Карточка лида: правка, этап, примечания, задачи, конверсия в клиента
function LeadModal({ lead, stages, branches, disc, onClose, onChanged }) {
  const [f, setF] = useState({ ...lead, branch_id: lead.branch_id || "", discipline_id: lead.discipline_id || "" });
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [note, setNote] = useState("");
  const [task, setTask] = useState({ title: "", due_date: "" });
  const [err, setErr] = useState("");

  const loadExtras = useCallback(() => {
    api.get(`/api/funnel/leads/${lead.id}/notes`).then(setNotes).catch(() => {});
    api.get(`/api/funnel/leads/${lead.id}/tasks`).then(setTasks).catch(() => {});
  }, [lead.id]);
  useEffect(() => { loadExtras(); }, [loadExtras]);

  const save = async () => {
    try {
      await api.put(`/api/funnel/leads/${lead.id}`, {
        name: f.name, phone: f.phone, branch_id: f.branch_id || null,
        discipline_id: f.discipline_id || null, comment: f.comment, stage_id: f.stage_id,
      });
      onChanged();
    } catch (e) { setErr(e.message); }
  };
  const convert = async () => {
    if (!confirm(`Сделать «${f.name}» клиентом? Пригласивший и направление перенесутся автоматически.`)) return;
    try { await api.post(`/api/funnel/leads/${lead.id}/convert`, {}); onChanged(); }
    catch (e) { setErr(e.message); }
  };
  const remove = async () => {
    if (!confirm("Удалить заявку?")) return;
    await api.del(`/api/funnel/leads/${lead.id}`); onChanged();
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await api.post(`/api/funnel/leads/${lead.id}/notes`, { text: note }); setNote(""); loadExtras();
  };
  const addTask = async () => {
    if (!task.title.trim()) return;
    await api.post(`/api/funnel/leads/${lead.id}/tasks`, task); setTask({ title: "", due_date: "" }); loadExtras();
  };

  return (
    <Modal title={`Заявка: ${lead.name}`} onClose={onClose}
      footer={<>
        <button onClick={remove} className="mr-auto inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"><Trash2 size={15} /> Удалить</button>
        <button className={btnGhost} onClick={onClose}>Закрыть</button>
        <button className={btnPrimary} onClick={save}>Сохранить</button>
      </>}>
      <div className="space-y-4">
        {lead.client_id
          ? <Link to={`/admin/clients/${lead.client_id}`} className="block rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:underline">✓ Уже клиент: {lead.client_name || lead.name} — открыть карточку</Link>
          : <button onClick={convert} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"><UserCheck size={16} /> Сделать клиентом</button>}
        {lead.referrer_name && <p className="text-xs text-amber-600">Пригласил(а): {lead.referrer_name} — связь будет перенесена при конверсии.</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Имя"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Телефон"><input className={inputCls} value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Этап">
            <select className={inputCls} value={f.stage_id || ""} onChange={(e) => setF({ ...f, stage_id: e.target.value })}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Филиал">
            <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Направление">
            <select className={inputCls} value={f.discipline_id} onChange={(e) => setF({ ...f, discipline_id: e.target.value })}>
              <option value="">—</option>
              {disc.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Комментарий"><textarea className={inputCls} rows={2} value={f.comment || ""} onChange={(e) => setF({ ...f, comment: e.target.value })} /></Field>

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-medium text-slate-700">Задачи</div>
          <ul className="mb-2 space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={t.done}
                  onChange={async (e) => { await api.patch(`/api/funnel/tasks/${t.id}`, { done: e.target.checked }); loadExtras(); }} />
                <span className={t.done ? "text-slate-400 line-through" : "text-slate-700"}>{t.title}</span>
                {t.due_date && <span className="text-xs text-slate-400">до {fmtDate(t.due_date)}</span>}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="напр. Позвонить в среду" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
            <input type="date" className={inputCls + " w-auto"} value={task.due_date} onChange={(e) => setTask({ ...task, due_date: e.target.value })} />
            <button className={btnGhost} onClick={addTask}><Plus size={15} /></button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 text-sm font-medium text-slate-700">Примечания</div>
          <div className="mb-2 flex gap-2">
            <input className={inputCls} placeholder="что обсудили…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
            <button className={btnGhost} onClick={addNote}><Plus size={15} /></button>
          </div>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600">
                {n.text}
                <span className="block text-[11px] text-slate-400">{n.author} · {fmtDate(n.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
