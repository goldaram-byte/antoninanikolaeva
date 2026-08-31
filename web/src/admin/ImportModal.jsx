import { useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { getToken } from "../api.js";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "../ui.jsx";

const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : "");

// Куда можно направить колонку файла
const TARGETS = [
  { id: "skip", label: "— не импортировать —" },
  { id: "name", label: "Имя / ФИО" },
  { id: "phone", label: "Телефон" },
  { id: "email", label: "Email" },
  { id: "birthdate", label: "Дата рождения" },
  { id: "gender", label: "Пол" },
  { id: "discount", label: "Скидка, %" },
  { id: "branch_name", label: "Филиал (из этой колонки)" },
  { id: "parent_name", label: "Родитель (имя)" },
  { id: "parent_phone", label: "Телефон родителя" },
  { id: "source", label: "Источник (откуда узнали)" },
  { id: "external_id", label: "ID в прежней CRM" },
  { id: "created_at", label: "Дата добавления клиента" },
  { id: "manager", label: "Ответственный сотрудник" },
  { id: "status", label: "Статус (активный / неактивный)" },
  { id: "note", label: "В заметки" },
  { id: "note_titled", label: "В заметки (с названием колонки)" },
];

// Автоугадывание по заголовку колонки. Порядок важен: «Добавлен в Филиал»
// должен попасть в филиал, а не в дату добавления.
function guess(header) {
  const h = String(header || "").toLowerCase();
  if (/филиал|отделен|зал\b|клуб/.test(h)) return "branch_name";
  if (/родител|мамы|папы|мать|отец/.test(h)) return /тел|phone/.test(h) ? "parent_phone" : (/фио|имя/.test(h) ? "parent_name" : "note_titled");
  if (/фио|имя|name|ученик|клиент|ребен|ребён/.test(h)) return "name";
  if (/тел|phone|моб/.test(h)) return "phone";
  if (/mail|почт/.test(h)) return "email";
  if (/рожд|birth|д\.р|др\b|дата р/.test(h)) return "birthdate";
  if (/^пол$|гендер|gender/.test(h)) return "gender";
  if (/скид/.test(h)) return "discount";
  if (/источник|source|откуда/.test(h)) return "source";
  if (/^id$|ид\b|номер карт|external/.test(h)) return "external_id";
  if (/добавлен|создан|регистрац|дата зав/.test(h)) return "created_at";
  if (/ответствен|менеджер|куратор/.test(h)) return "manager";
  if (/^статус|состояние|активн/.test(h)) return "status";
  if (/замет|коммент|примеч/.test(h)) return "note";
  return "skip";
}

async function uploadForm(path, file, fields = {}) {
  const fd = new FormData();
  fd.append("file", file);
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  const res = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`);
  return data;
}

// Мастер импорта клиентов из Excel/CSV с сопоставлением колонок
export default function ImportModal({ branches, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);   // {headers, rows, total}
  const [mapping, setMapping] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [skipDup, setSkipDup] = useState(true);
  const [createBranches, setCreateBranches] = useState(true);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const pickFile = async (f) => {
    if (!f) return;
    setErr(""); setBusy(true); setFile(f); setResult(null);
    try {
      const p = await uploadForm("/api/import/clients/preview", f);
      setPreview(p);
      setMapping(p.headers.map(guess));
    } catch (e) { setErr(e.message); setFile(null); setPreview(null); }
    finally { setBusy(false); }
  };

  const byBranchColumn = mapping.includes("branch_name");
  const filled = preview?.filled || [];
  // колонки с данными, которые сейчас никуда не идут — их не должно остаться
  const lostCols = mapping.map((m, i) => (m === "skip" && (filled[i] ?? 0) > 0 ? i : -1)).filter((i) => i >= 0);
  const emptyCols = filled.filter((n) => n === 0).length;
  const dumpRest = () => setMapping((m) => m.map((x, i) => (x === "skip" && (filled[i] ?? 0) > 0 ? "note_titled" : x)));

  const run = async () => {
    if (!mapping.includes("name")) return setErr("Выберите, в какой колонке имя клиента");
    setErr(""); setBusy(true);
    try {
      const r = await uploadForm("/api/import/clients", file, {
        mapping: JSON.stringify(mapping),
        branch_id: branchId,
        skip_duplicates: skipDup ? "1" : "0",
        create_branches: createBranches ? "1" : "0",
      });
      setResult(r);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Импорт клиентов из Excel / CSV" onClose={onClose}
      footer={result
        ? <button className={btnPrimary} onClick={onDone}>Готово</button>
        : <>
          <button className={btnGhost} onClick={onClose}>Отмена</button>
          {preview && <button className={btnPrimary} disabled={busy} onClick={run}>{busy ? "Импортируем…" : `Импортировать ${preview.total} строк`}</button>}
        </>}>
      <div className="space-y-4">
        {!preview && !result && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-8 text-slate-500 hover:border-brand hover:text-brand">
            <Upload size={28} />
            <span className="text-sm font-medium">{busy ? "Читаем файл…" : "Выбрать файл .xlsx или .csv"}</span>
            <span className="text-xs text-slate-400">Первая строка файла — названия колонок</span>
            <input type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        )}

        {preview && !result && (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <FileSpreadsheet size={16} className="text-emerald-600" />
              <span className="font-medium">{file.name}</span>
              <span className="text-slate-400">· строк: {preview.total}</span>
              <button className="ml-auto text-xs text-brand hover:underline" onClick={() => { setFile(null); setPreview(null); }}>выбрать другой</button>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Куда импортировать каждую колонку</div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {preview.headers.map((h, i) => (
                  <div key={i} className="grid grid-cols-2 items-center gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{h || `Колонка ${i + 1}`}</div>
                      <div className="truncate text-xs text-slate-400">
                        {(filled[i] ?? 0) === 0
                          ? "колонка пустая"
                          : `${filled[i]} из ${preview.total} · ${preview.rows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ")}`}
                      </div>
                    </div>
                    <select className={inputCls + ((filled[i] ?? 0) === 0 ? " text-slate-400" : "")} value={mapping[i] || "skip"}
                      onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? e.target.value : x)))}>
                      {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                «В заметки (с названием колонки)» сохраняет любые дополнительные столбцы в заметки клиента, например «Пояс: жёлтый».
                «Филиал (из этой колонки)» разложит клиентов по филиалам прямо из файла.
              </p>

              {lostCols.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span>
                    Не импортируются колонки с данными: <b>{lostCols.map((i) => preview.headers[i] || `Колонка ${i + 1}`).join(", ")}</b>
                  </span>
                  <button className="ml-auto rounded-md bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700" onClick={dumpRest}>
                    Сложить их в заметки
                  </button>
                </div>
              ) : (
                <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  Все колонки с данными учтены{emptyCols > 0 ? ` (пустых колонок в файле: ${emptyCols} — импортировать нечего)` : ""}.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={byBranchColumn ? "Филиал, если в строке пусто" : "Филиал для всех импортируемых"}>
                <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">— не указывать —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <div className="space-y-2 pt-6">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                  Пропускать дубликаты по телефону
                </label>
                {byBranchColumn && (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4" checked={createBranches} onChange={(e) => setCreateBranches(e.target.checked)} />
                    Создавать филиалы, которых ещё нет
                  </label>
                )}
              </div>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              ✓ Импортировано клиентов: <b>{result.created}</b>
              {result.skipped > 0 && <> · пропущено дубликатов: <b>{result.skipped}</b></>}
            </div>
            {result.created_branches?.length > 0 && (
              <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
                Созданы филиалы: <b>{result.created_branches.join(", ")}</b>
              </div>
            )}
            {result.managers_not_found?.length > 0 && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Не нашлись сотрудники из колонки «Ответственный»: <b>{result.managers_not_found.join(", ")}</b>.
                Клиенты импортированы без ответственного — назначьте его в карточке или заведите сотрудника
                с таким же именем в Настройках → Сотрудники и повторите импорт.
              </div>
            )}
            {result.errors_total > 0 && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Строк с ошибками: {result.errors_total}
                <ul className="mt-1 list-inside list-disc text-xs">
                  {result.errors.map((e, i) => <li key={i}>строка {e.row}: {e.reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
