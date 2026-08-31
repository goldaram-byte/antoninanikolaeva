import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Pencil, Upload } from "lucide-react";
import { api, hasPerm } from "../api.js";
import { useSettings } from "../settings.jsx";
import { Header, Empty, Spinner, Modal, Field, inputCls, btnPrimary, btnGhost, money } from "../ui.jsx";
import ImportModal from "./ImportModal.jsx";

export default function Clients() {
  const { currency } = useSettings();
  const [list, setList] = useState(null);
  const [branches, setBranches] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [disc, setDisc] = useState([]);
  const [q, setQ] = useState("");
  const [fBranch, setFBranch] = useState("");
  const [fTrainer, setFTrainer] = useState("");
  const [edit, setEdit] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (fBranch) params.set("branch_id", fBranch);
    if (fTrainer) params.set("trainer_id", fTrainer);
    setList(await api.get(`/api/clients?${params.toString()}`));
  };
  useEffect(() => {
    api.get("/api/branches").then(setBranches).catch(() => {});
    api.get("/api/catalog/trainers").then(setTrainers).catch(() => {});
    api.get("/api/catalog/disciplines").then(setDisc).catch(() => {});
  }, []);
  useEffect(() => { load().catch(() => setList([])); /* eslint-disable-next-line */ }, [q, fBranch, fTrainer]);

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
      </div>

      {!list ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          {list.length === 0 ? <Empty text="Никого не нашлось." />
            : <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-4 py-2.5">Имя</th><th className="px-4 py-2.5">Филиал</th><th className="px-4 py-2.5">Тренеры</th><th className="px-4 py-2.5">Телефон</th><th className="px-4 py-2.5">Долг</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><Link to={`/admin/clients/${c.id}`} className="font-medium text-slate-900 hover:text-brand">{c.name}</Link></td>
                    <td className="px-4 py-3 text-slate-500">{c.branch_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{(c.trainers || []).map((t) => t.name).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.phone || (c.parent_phone ? <>{c.parent_phone} <span className="text-xs text-slate-400">(род.)</span></> : "—")}
                    </td>
                    <td className="px-4 py-3">{Number(c.debt) > 0 ? <span className="font-semibold text-red-600">{money(c.debt, currency)}</span> : <span className="text-slate-400">—</span>}</td>
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
    referral_code: "",
  });
  const [err, setErr] = useState("");

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
        source: f.source,
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
