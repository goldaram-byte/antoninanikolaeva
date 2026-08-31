import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Pencil, Upload } from "lucide-react";
import { api, hasPerm } from "../api.js";
import { Header, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost, money } from "../ui.jsx";
import ImportModal from "./ImportModal.jsx";
import { WEEKDAYS } from "./Schedule.jsx";

export default function Clients() {
  const [list, setList] = useState(null);
  const [branches, setBranches] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [disc, setDisc] = useState([]);
  const [q, setQ] = useState("");
  const [fBranch, setFBranch] = useState("");
  const [fTrainer, setFTrainer] = useState("");
  const [fManager, setFManager] = useState("");
  const [fStatus, setFStatus] = useState("active");   // по умолчанию показываем действующих
  const [managers, setManagers] = useState([]);
  const [edit, setEdit] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sel, setSel] = useState(() => new Set());   // выделенные клиенты
  const [sessions, setSessions] = useState([]);      // группы расписания
  const [bulk, setBulk] = useState({ trainer: "", disc: "", session: "" });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (fBranch) params.set("branch_id", fBranch);
    if (fTrainer) params.set("trainer_id", fTrainer);
    if (fManager) params.set("manager_id", fManager);
    if (fStatus) params.set("status", fStatus);
    setList(await api.get(`/api/clients?${params.toString()}`));
  };
  useEffect(() => {
    api.get("/api/branches").then(setBranches).catch(() => {});
    api.get("/api/catalog/trainers").then(setTrainers).catch(() => {});
    api.get("/api/catalog/disciplines").then(setDisc).catch(() => {});
    api.get("/api/catalog/managers").then(setManagers).catch(() => {});
    api.get("/api/schedule").then(setSessions).catch(() => {});   // может быть недоступно по правам
  }, []);
  useEffect(() => {
    setSel(new Set()); setBulkMsg("");
    load().catch(() => setList([]));
    /* eslint-disable-next-line */
  }, [q, fBranch, fTrainer, fManager, fStatus]);

  const toggleOne = (id) => setSel((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allChecked = !!list?.length && list.every((c) => sel.has(c.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set((list || []).map((c) => c.id)));

  // Массовое действие над выделенными
  const runBulk = async (action, extra = {}, confirmText) => {
    if (sel.size === 0) return;
    if (confirmText && !confirm(`${confirmText} Выбрано клиентов: ${sel.size}.`)) return;
    setBulkBusy(true); setBulkMsg("");
    try {
      const r = await api.post("/api/clients/bulk", { ids: [...sel], action, ...extra });
      setBulkMsg(`Готово. Изменено клиентов: ${r.affected}.`);
      setSel(new Set());
      await load();
    } catch (e) { setBulkMsg(e.message); }
    finally { setBulkBusy(false); }
  };

  const sessionLabel = (s) =>
    `${WEEKDAYS[s.day_of_week]} ${String(s.start_time).slice(0, 5)} · ${s.title || s.discipline_name || "Занятие"}` +
    (s.branch_name ? ` · ${s.branch_name}` : "");

  return (
    <div className="space-y-5">
      <Header title="Клиенты" subtitle={list ? `${list.length} в выборке` : ""}
        action={hasPerm("clients_edit") ? (
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => setImportOpen(true)}><Upload size={15} /> Импорт</button>
            <button className={btnPrimary} onClick={() => setEdit({})}><Plus size={16} /> Новый клиент</button>
          </div>
        ) : null} />

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className={inputCls + " pl-9"} placeholder="Поиск: имя, телефон, родитель" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={inputCls + " w-auto"} value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
          <option value="">Все филиалы</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className={inputCls + " w-auto"} value={fTrainer} onChange={(e) => setFTrainer(e.target.value)}>
          <option value="">Все тренеры</option>
          {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className={inputCls + " w-auto"} value={fManager} onChange={(e) => setFManager(e.target.value)}>
          <option value="">Все ответственные</option>
          {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className={inputCls + " w-auto"} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
          <option value="">Все статусы</option>
        </select>
      </div>

      {hasPerm("clients_edit") && sel.size > 0 && (
        <div className="space-y-2 rounded-xl border border-brand/30 bg-red-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-slate-800">Выбрано: {sel.size}</span>
            <button className="text-xs text-slate-500 hover:underline" onClick={() => setSel(new Set())}>снять выделение</button>
            <span className="ml-auto flex gap-2">
              <button className={btnGhost} disabled={bulkBusy}
                onClick={() => runBulk("status_active", {}, "Сделать выбранных клиентов активными?")}>Сделать активными</button>
              <button className={btnGhost} disabled={bulkBusy}
                onClick={() => runBulk("status_inactive", {}, "Сделать выбранных клиентов неактивными?")}>Сделать неактивными</button>
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <BulkRow label="Тренер" value={bulk.trainer} onChange={(v) => setBulk({ ...bulk, trainer: v })}
              options={trainers.map((t) => ({ id: t.id, name: t.name }))} busy={bulkBusy}
              onAdd={() => runBulk("trainer_add", { trainer_id: bulk.trainer })}
              onRemove={() => runBulk("trainer_remove", { trainer_id: bulk.trainer }, "Открепить выбранных клиентов от тренера?")} />

            <BulkRow label="Направление" value={bulk.disc} onChange={(v) => setBulk({ ...bulk, disc: v })}
              options={disc.map((d) => ({ id: d.id, name: d.name }))} busy={bulkBusy}
              onAdd={() => runBulk("discipline_add", { discipline_id: bulk.disc })}
              onRemove={() => runBulk("discipline_remove", { discipline_id: bulk.disc }, "Убрать направление у выбранных клиентов?")} />

            <BulkRow label="Группа расписания" value={bulk.session} onChange={(v) => setBulk({ ...bulk, session: v })}
              options={sessions.map((x) => ({ id: x.id, name: sessionLabel(x) }))} busy={bulkBusy}
              onAdd={() => runBulk("session_add", { session_id: bulk.session })}
              onRemove={() => runBulk("session_remove", { session_id: bulk.session }, "Убрать выбранных клиентов из группы?")} />
          </div>
        </div>
      )}
      {bulkMsg && <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">{bulkMsg}</div>}

      {!list ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          {list.length === 0 ? <Empty text="Никого не нашлось." />
            : <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  {hasPerm("clients_edit") && (
                    <th className="px-4 py-2.5">
                      <input type="checkbox" className="h-4 w-4 align-middle" checked={allChecked} onChange={toggleAll} title="Выделить всех в выборке" />
                    </th>
                  )}
                  <th className="px-4 py-2.5">Имя</th><th className="px-4 py-2.5">Филиал</th><th className="px-4 py-2.5">Тренеры</th><th className="px-4 py-2.5">Ответственный</th><th className="px-4 py-2.5">Телефон</th><th className="px-4 py-2.5">Долг</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((c) => (
                  <tr key={c.id} className={sel.has(c.id) ? "bg-red-50/50" : "hover:bg-slate-50"}>
                    {hasPerm("clients_edit") && (
                      <td className="px-4 py-3">
                        <input type="checkbox" className="h-4 w-4 align-middle" checked={sel.has(c.id)} onChange={() => toggleOne(c.id)} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Link to={`/admin/clients/${c.id}`} className="font-medium text-slate-900 hover:text-brand">{c.name}</Link>
                      {c.status === "inactive" && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">неактивный</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.branch_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{(c.trainers || []).map((t) => t.name).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.manager_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.phone || (c.parent_phone ? <>{c.parent_phone} <span className="text-xs text-slate-400">(род.)</span></> : "—")}
                    </td>
                    <td className="px-4 py-3">{Number(c.debt) > 0 ? <span className="font-semibold text-red-600">{money(c.debt)}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-right">{hasPerm("clients_edit") && <button onClick={() => setEdit(c)} className="text-slate-400 hover:text-slate-700"><Pencil size={15} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
      )}

      {edit && <ClientForm client={edit} branches={branches} trainers={trainers} disc={disc}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {importOpen && <ImportModal branches={branches}
        onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}
    </div>
  );
}

// Строка панели массовых действий: выбор значения + «прикрепить / открепить»
function BulkRow({ label, value, onChange, options, onAdd, onRemove, busy }) {
  return (
    <div className="flex items-center gap-1.5">
      <select className={inputCls + " min-w-0 flex-1"} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label} —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button className={btnGhost + " px-2"} disabled={!value || busy} onClick={onAdd} title={`Прикрепить: ${label.toLowerCase()}`}>+</button>
      <button className={btnGhost + " px-2"} disabled={!value || busy} onClick={onRemove} title={`Открепить: ${label.toLowerCase()}`}>−</button>
    </div>
  );
}

export function ClientForm({ client, branches, trainers, disc, onClose, onSaved }) {
  const isNew = !client.id;
  const [f, setF] = useState({
    name: "", phone: "", email: "", notes: "", ...client,
    birthdate: client.birthdate?.slice(0, 10) || "",
    branch_id: client.branch_id || "",
    discipline_ids: (client.disciplines || []).map((d) => d.id),
    trainer_ids: (client.trainers || []).map((t) => t.id),
    discount_percent: client.discount_percent || 0,
    gender: client.gender || "",
    parent_name: client.parent_name || "",
    parent_phone: client.parent_phone || "",
    source: client.source || "",
    manager_id: client.manager_id || "",
    status: client.status || "active",
    referral_code: "",
  });
  const [err, setErr] = useState("");
  const [managers, setManagers] = useState([]);
  useEffect(() => { api.get("/api/catalog/managers").then(setManagers).catch(() => {}); }, []);

  const toggle = (key, id) => setF((p) => ({ ...p, [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id] }));

  const save = async () => {
    if (!f.name.trim()) return setErr("Имя обязательно");
    try {
      const body = {
        name: f.name, phone: f.phone, email: f.email, birthdate: f.birthdate || null,
        notes: f.notes, branch_id: f.branch_id || null,
        discipline_ids: f.discipline_ids, trainer_ids: f.trainer_ids,
        discount_percent: Number(f.discount_percent) || 0,
        gender: f.gender || null, parent_name: f.parent_name, parent_phone: f.parent_phone,
        source: f.source, manager_id: f.manager_id || null, status: f.status,
      };
      if (isNew && f.referral_code.trim()) body.referral_code = f.referral_code.trim();
      if (isNew) await api.post("/api/clients", body);
      else await api.put(`/api/clients/${f.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  const remove = async () => {
    if (!confirm("Удалить клиента вместе с его абонементами и историей оплат?")) return;
    await api.del(`/api/clients/${f.id}`); onSaved();
  };

  return (
    <Modal title={isNew ? "Новый клиент" : "Клиент"} onClose={onClose}
      footer={<>
        {!isNew && <button onClick={remove} className="mr-auto text-sm text-red-500 hover:text-red-700">Удалить</button>}
        <button className={btnGhost} onClick={onClose}>Отмена</button>
        <button className={btnPrimary} onClick={save}>Сохранить</button>
      </>}>
      <div className="space-y-4">
        <Field label="Имя и фамилия"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон"><input className={inputCls} placeholder="+7…" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Дата рождения"><input type="date" className={inputCls} value={f.birthdate || ""} onChange={(e) => setF({ ...f, birthdate: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Пол">
            <select className={inputCls} value={f.gender || ""} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">— не указан —</option>
              <option value="m">Мужской</option>
              <option value="f">Женский</option>
            </select>
          </Field>
          <Field label="Email"><input className={inputCls} value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>

        {/* Родитель — в детской школе звонят обычно ему */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Родитель (имя)"><input className={inputCls} value={f.parent_name || ""} onChange={(e) => setF({ ...f, parent_name: e.target.value })} /></Field>
          <Field label="Телефон родителя"><input className={inputCls} placeholder="+7…" value={f.parent_phone || ""} onChange={(e) => setF({ ...f, parent_phone: e.target.value })} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Источник (откуда узнали)"><input className={inputCls} value={f.source || ""} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="напр. Рекомендации" /></Field>
          <Field label="Филиал">
            <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ответственный сотрудник">
            <select className={inputCls} value={f.manager_id || ""} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
              <option value="">— не назначен —</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Статус">
            <select className={inputCls} value={f.status || "active"} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="active">Активный (занимается)</option>
              <option value="inactive">Неактивный (перестал ходить)</option>
            </select>
          </Field>
        </div>

        <Field label="Направления">
          <div className="flex flex-wrap gap-2">
            {disc.map((d) => (
              <button key={d.id} type="button" onClick={() => toggle("discipline_ids", d.id)}
                className={`rounded-full border px-3 py-1 text-sm ${f.discipline_ids.includes(d.id) ? "border-transparent text-white" : "border-slate-200 text-slate-600"}`}
                style={f.discipline_ids.includes(d.id) ? { background: d.color } : {}}>{d.name}</button>
            ))}
          </div>
        </Field>

        <Field label="Тренеры">
          <div className="flex flex-wrap gap-2">
            {trainers.map((t) => (
              <button key={t.id} type="button" onClick={() => toggle("trainer_ids", t.id)}
                className={`rounded-full border px-3 py-1 text-sm ${f.trainer_ids.includes(t.id) ? "border-brand bg-red-50 text-brand-dark" : "border-slate-200 text-slate-600"}`}>{t.name}</button>
            ))}
            {trainers.length === 0 && <span className="text-xs text-slate-400">Сначала добавьте тренеров в Настройках</span>}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Персональная скидка, %"><input type="number" className={inputCls} value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: e.target.value })} /></Field>
          {isNew && <Field label="Код пригласившего"><input className={inputCls} value={f.referral_code} onChange={(e) => setF({ ...f, referral_code: e.target.value })} placeholder="напр. REF7WG5PQ" /></Field>}
        </div>
        <Field label="Заметки"><textarea className={inputCls} rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
