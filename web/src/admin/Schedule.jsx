import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, CalendarX2 } from "lucide-react";
import { api, hasPerm } from "../api.js";
import { Header, Panel, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const fmtDate = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : "—");

export default function Schedule() {
  const [list, setList] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [disc, setDisc] = useState([]);
  const [fBranch, setFBranch] = useState("");
  const [edit, setEdit] = useState(null);      // занятие для редактирования / {} для нового
  const [once, setOnce] = useState(null);      // занятие для разового изменения

  const load = useCallback(async () => {
    const p = fBranch ? `?branch_id=${fBranch}` : "";
    setList(await api.get(`/api/schedule${p}`));
    setExceptions(await api.get("/api/schedule/exceptions"));
  }, [fBranch]);
  useEffect(() => {
    api.get("/api/branches").then(setBranches).catch(() => {});
    api.get("/api/catalog/trainers").then(setTrainers).catch(() => {});
    api.get("/api/catalog/disciplines").then(setDisc).catch(() => {});
  }, []);
  useEffect(() => { load().catch(() => setList([])); }, [load]);

  const canEdit = hasPerm("schedule_edit");

  return (
    <div className="space-y-5">
      <Header title="Расписание" subtitle="Недельная сетка занятий по филиалам"
        action={canEdit ? <button className={btnPrimary} onClick={() => setEdit({})}><Plus size={16} /> Занятие</button> : null} />

      <select className={inputCls + " w-auto"} value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
        <option value="">Все филиалы</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>

      {!list ? <Spinner /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {WEEKDAYS.map((day, i) => {
            const items = list.filter((s) => s.day_of_week === i);
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{day}</div>
                <div className="space-y-2 p-2">
                  {items.length === 0 && <div className="py-3 text-center text-xs text-slate-300">—</div>}
                  {items.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.discipline_color || "#DC2626" }} />
                        <span className="font-semibold text-slate-800">{s.start_time}–{s.end_time}</span>
                      </div>
                      <div className="mt-0.5 font-medium text-slate-700">{s.title || s.discipline_name || "Занятие"}</div>
                      <div className="text-slate-400">{[s.branch_name, s.trainer_name].filter(Boolean).join(" · ")}</div>
                      <div className="text-slate-400">в группе: {s.members}</div>
                      {canEdit && (
                        <div className="mt-1.5 flex gap-2">
                          <button className="text-brand hover:underline" onClick={() => setEdit(s)}>серия</button>
                          <button className="text-amber-600 hover:underline" onClick={() => setOnce(s)}>разово</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {exceptions.length > 0 && (
        <Panel title="Разовые изменения (ближайшие)">
          <ul className="divide-y divide-slate-100 text-sm">
            {exceptions.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <CalendarX2 size={15} className={e.kind === "cancelled" ? "text-red-500" : "text-amber-500"} />
                <span className="w-24 shrink-0 text-slate-500">{fmtDate(e.date)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {e.title || e.discipline_name || "Занятие"} ({e.orig_start}){e.branch_name ? ` · ${e.branch_name}` : ""} —{" "}
                  {e.kind === "cancelled" ? <b className="text-red-600">отменено</b> : <b className="text-amber-600">перенос на {e.new_start}{e.new_end ? `–${e.new_end}` : ""}</b>}
                  {e.note && <span className="text-slate-400"> · {e.note}</span>}
                </span>
                {canEdit && <button onClick={async () => { await api.del(`/api/schedule/exceptions/${e.id}`); load(); }}
                  className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {edit && <SessionForm session={edit} branches={branches} trainers={trainers} disc={disc}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {once && <OnceForm session={once} onClose={() => setOnce(null)} onSaved={() => { setOnce(null); load(); }} />}
    </div>
  );
}

// Создание (сразу в несколько дней) и изменение серии занятий
function SessionForm({ session, branches, trainers, disc, onClose, onSaved }) {
  const isNew = !session.id;
  const [f, setF] = useState({
    title: "", start_time: "18:00", end_time: "19:00", capacity: 12, room: "", ...session,
    // пустая строка вместо null — иначе <select> не выберет вариант «не выбран»
    branch_id: session.branch_id || "", discipline_id: session.discipline_id || "", trainer_id: session.trainer_id || "",
    days: isNew ? [] : [session.day_of_week],
  });
  const [err, setErr] = useState("");
  const toggleDay = (d) => setF((p) => ({ ...p, days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d] }));

  const save = async () => {
    try {
      const body = {
        title: f.title, branch_id: f.branch_id || null, discipline_id: f.discipline_id || null,
        trainer_id: f.trainer_id || null, start_time: f.start_time, end_time: f.end_time,
        capacity: Number(f.capacity) || 12, room: f.room,
      };
      if (isNew) await api.post("/api/schedule", { ...body, days: f.days });
      else await api.put(`/api/schedule/${f.id}`, { ...body, day_of_week: f.days[0] });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  const remove = async () => {
    if (!confirm("Удалить занятие из расписания? Привязка группы и записи на него пропадут.")) return;
    await api.del(`/api/schedule/${f.id}`); onSaved();
  };

  return (
    <Modal title={isNew ? "Новое занятие" : "Изменить серию занятий"} onClose={onClose}
      footer={<>{!isNew && <button onClick={remove} className="mr-auto inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"><Trash2 size={15} /> Удалить</button>}
        <button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      <div className="space-y-4">
        {!isNew && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Изменения применятся ко ВСЕМ повторениям этого занятия. Для отмены/переноса на одну дату используйте «разово».</p>}
        <Field label="Название"><input className={inputCls} value={f.title} placeholder="напр. Каратэ (младшая группа)" onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Филиал">
            <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Тренер">
            <select className={inputCls} value={f.trainer_id} onChange={(e) => setF({ ...f, trainer_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Направление">
          <select className={inputCls} value={f.discipline_id} onChange={(e) => setF({ ...f, discipline_id: e.target.value })}>
            <option value="">— не выбрано —</option>
            {disc.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label={isNew ? "Дни недели (можно несколько)" : "День недели"}>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => (
              <button key={i} type="button"
                onClick={() => isNew ? toggleDay(i) : setF({ ...f, days: [i] })}
                className={`rounded-lg border px-3 py-1.5 text-sm ${f.days.includes(i) ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600"}`}>{d}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало"><input type="time" className={inputCls} value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
          <Field label="Конец"><input type="time" className={inputCls} value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Вместимость"><input type="number" className={inputCls} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          <Field label="Зал / помещение"><input className={inputCls} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field>
        </div>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

// Разовое изменение одного занятия: отмена или перенос на конкретную дату
function OnceForm({ session, onClose, onSaved }) {
  // ближайшие 6 дат этого дня недели
  const dates = [];
  const d = new Date();
  for (let i = 0; i < 42 && dates.length < 6; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i);
    if ((x.getDay() + 6) % 7 === session.day_of_week) dates.push(x.toISOString().slice(0, 10));
  }
  const [f, setF] = useState({ date: dates[0] || "", kind: "cancelled", new_start: session.start_time, new_end: session.end_time, note: "" });
  const [err, setErr] = useState("");
  const save = async () => {
    try {
      await api.post(`/api/schedule/${session.id}/exceptions`, {
        date: f.date, kind: f.kind,
        new_start: f.kind === "moved" ? f.new_start : null,
        new_end: f.kind === "moved" ? f.new_end : null,
        note: f.note,
      });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={`Разовое изменение: ${session.title || session.discipline_name || "Занятие"} (${WEEKDAYS[session.day_of_week]} ${session.start_time})`} onClose={onClose}
      footer={<><button className={btnGhost} onClick={onClose}>Отмена</button><button className={btnPrimary} onClick={save}>Сохранить</button></>}>
      <div className="space-y-4">
        <Field label="Дата">
          <select className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>
            {dates.map((x) => <option key={x} value={x}>{fmtDate(x)}</option>)}
          </select>
        </Field>
        <Field label="Что сделать">
          <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="cancelled">Отменить занятие в этот день</option>
            <option value="moved">Перенести время в этот день</option>
          </select>
        </Field>
        {f.kind === "moved" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Новое начало"><input type="time" className={inputCls} value={f.new_start} onChange={(e) => setF({ ...f, new_start: e.target.value })} /></Field>
            <Field label="Новый конец"><input type="time" className={inputCls} value={f.new_end} onChange={(e) => setF({ ...f, new_end: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Примечание"><input className={inputCls} value={f.note} placeholder="напр. тренер на соревнованиях" onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
