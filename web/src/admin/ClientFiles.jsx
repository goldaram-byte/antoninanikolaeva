import { useEffect, useRef, useState, useCallback } from "react";
import { Paperclip, Download, Trash2, FileText, Image as ImageIcon, File } from "lucide-react";
import { api, hasPerm, getToken } from "../api.js";
import { Panel, Empty, btnGhost } from "../ui.jsx";

const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : "");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("ru-RU") : "");
const fmtSize = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);
const Icon = ({ mime }) => mime.startsWith("image/") ? <ImageIcon size={18} className="text-sky-500" />
  : mime === "application/pdf" ? <FileText size={18} className="text-red-500" /> : <File size={18} className="text-slate-400" />;

// Файлы в карточке клиента: загрузка, просмотр/скачивание, удаление.
// Запросы идут с токеном, поэтому открытие файла — через fetch → blob, а не по прямой ссылке.
export default function ClientFiles({ clientId }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);
  const canEdit = hasPerm("clients_edit");

  const load = useCallback(() => api.get(`/api/clients/${clientId}/files`).then(setFiles).catch(() => setFiles([])), [clientId]);
  useEffect(() => { load(); }, [load]);

  const uploadFiles = async (list) => {
    if (!list?.length) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      [...list].forEach((f) => fd.append("files", f));
      const res = await fetch(`${BASE}/api/clients/${clientId}/files`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  // открыть (картинки и PDF — в новой вкладке) или скачать
  const open = async (f, download) => {
    setErr("");
    try {
      const res = await fetch(`${BASE}/api/files/${f.id}${download ? "?download=1" : ""}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error("Не удалось получить файл");
      const url = URL.createObjectURL(await res.blob());
      if (download || !/^(image\/|application\/pdf)/.test(f.mime)) {
        const a = document.createElement("a"); a.href = url; a.download = f.name;
        document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 0);
      } else {
        window.open(url, "_blank", "noopener");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setErr(e.message); }
  };

  const remove = async (f) => {
    if (!confirm(`Удалить файл «${f.name}»?`)) return;
    setErr("");
    try { await api.del(`/api/files/${f.id}`); await load(); } catch (e) { setErr(e.message); }
  };

  return (
    <Panel title={`Файлы${files?.length ? ` · ${files.length}` : ""}`}
      action={canEdit ? (
        <>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
          <button className={btnGhost} disabled={busy} onClick={() => inputRef.current?.click()}>
            <Paperclip size={15} /> {busy ? "Загружаем…" : "Прикрепить"}
          </button>
        </>
      ) : null}>
      {/* перетащить файлы прямо на блок */}
      <div
        onDragOver={(e) => { if (canEdit) { e.preventDefault(); } }}
        onDrop={(e) => { if (canEdit) { e.preventDefault(); uploadFiles(e.dataTransfer.files); } }}>
        {!files ? <div className="py-4 text-center text-sm text-slate-400">Загрузка…</div>
          : files.length === 0 ? <Empty text={canEdit ? "Файлов пока нет. Нажмите «Прикрепить» или перетащите сюда: договор, справку, фото." : "Файлов нет."} />
          : <ul className="divide-y divide-slate-100 text-sm">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2">
                <Icon mime={f.mime || ""} />
                <button className="min-w-0 flex-1 truncate text-left font-medium text-slate-800 hover:text-brand" title="Открыть" onClick={() => open(f, false)}>
                  {f.name}
                </button>
                <span className="hidden text-xs text-slate-400 sm:inline">{fmtSize(Number(f.size))} · {fmtDate(f.created_at)}{f.uploaded_by ? ` · ${f.uploaded_by}` : ""}</span>
                <button title="Скачать" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => open(f, true)}><Download size={15} /></button>
                {canEdit && <button title="Удалить" className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500" onClick={() => remove(f)}><Trash2 size={15} /></button>}
              </li>
            ))}
          </ul>}
      </div>
      {err && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      <p className="mt-2 text-xs text-slate-400">До 25 МБ на файл: PDF, фото, документы Word/Excel, архивы.</p>
    </Panel>
  );
}
