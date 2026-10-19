// Файлы в карточке клиента: договоры, справки, фото.
// Файлы хранятся на диске в UPLOAD_DIR (по умолчанию server/uploads/clients),
// отдаются только через API с проверкой входа — прямой ссылки снаружи нет.
import { Router } from "express";
import multer from "multer";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, createReadStream, unlink } from "node:fs";
import { join, extname, basename } from "node:path";
import { q } from "../db.js";
import { employee, can } from "../auth.js";

export const UPLOAD_DIR = join(process.env.UPLOAD_DIR || join(process.cwd(), "uploads"), "clients");
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const r = Router();
r.use(employee);

const MAX_MB = 25;
// исполняемые файлы не принимаем — остальное (pdf, фото, документы, архивы) можно
const FORBIDDEN = new Set([".exe", ".bat", ".cmd", ".sh", ".js", ".msi", ".com", ".scr", ".ps1", ".vbs", ".jar", ".apk"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // на диске — случайное имя с исходным расширением, чтобы не было коллизий и путей
    filename: (_req, file, cb) => cb(null, randomBytes(16).toString("hex") + extname(file.originalname).toLowerCase().slice(0, 10)),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (FORBIDDEN.has(extname(file.originalname).toLowerCase())) return cb(new Error("Такой тип файла загружать нельзя"));
    cb(null, true);
  },
});

// multer отдаёт имя файла в latin1 — переводим обратно в UTF-8 (русские имена)
const fixName = (s) => { try { return Buffer.from(s, "latin1").toString("utf8"); } catch { return s; } };

// Тренеру в режиме «только свои» доступны файлы только своих учеников
async function assertClientAccess(req, clientId) {
  if (req.user.scope !== "own" || !req.user.trainerId) return;
  const { rows: [{ cnt }] } = await q(
    "SELECT count(*)::int AS cnt FROM client_trainers_all WHERE client_id=$1 AND trainer_id=$2", [clientId, req.user.trainerId]);
  if (cnt === 0) throw Object.assign(new Error("Это не ваш клиент"), { status: 403 });
}

// Список файлов клиента
r.get("/clients/:id/files", can("clients_view"), async (req, res, next) => {
  try {
    await assertClientAccess(req, req.params.id);
    const { rows } = await q(
      "SELECT id, name, mime, size, note, uploaded_by, created_at FROM client_files WHERE client_id=$1 ORDER BY created_at DESC",
      [req.params.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Загрузка (можно несколько файлов сразу, поле формы — files)
r.post("/clients/:id/files", can("clients_edit"), (req, res, next) => {
  upload.array("files", 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? `Файл больше ${MAX_MB} МБ` : err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    await assertClientAccess(req, req.params.id);
    const { rows: [client] } = await q("SELECT id FROM clients WHERE id=$1", [req.params.id]);
    if (!client) return res.status(404).json({ error: "Клиент не найден" });
    const note = String(req.body?.note || "").slice(0, 300);
    const saved = [];
    for (const f of req.files || []) {
      const { rows: [row] } = await q(
        `INSERT INTO client_files(client_id, name, stored_name, mime, size, note, uploaded_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, mime, size, note, uploaded_by, created_at`,
        [req.params.id, fixName(f.originalname).slice(0, 200), f.filename, f.mimetype || "", f.size, note, req.user.name || ""]);
      saved.push(row);
    }
    if (saved.length === 0) return res.status(400).json({ error: "Файлы не получены" });
    res.json(saved);
  } catch (e) { next(e); }
});

// Скачать / открыть файл. Отдаём с исходным именем; картинки и PDF браузер покажет сам.
r.get("/files/:fileId", can("clients_view"), async (req, res, next) => {
  try {
    const { rows: [f] } = await q("SELECT * FROM client_files WHERE id=$1", [req.params.fileId]);
    if (!f) return res.status(404).json({ error: "Файл не найден" });
    await assertClientAccess(req, f.client_id);
    const path = join(UPLOAD_DIR, basename(f.stored_name));
    if (!existsSync(path)) return res.status(404).json({ error: "Файл отсутствует на диске" });
    const inline = /^(image\/|application\/pdf)/.test(f.mime) && req.query.download !== "1";
    res.setHeader("Content-Type", f.mime || "application/octet-stream");
    res.setHeader("Content-Length", String(f.size));
    res.setHeader("Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(f.name)}"; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    createReadStream(path).pipe(res);
  } catch (e) { next(e); }
});

// Удалить файл (и с диска тоже)
r.delete("/files/:fileId", can("clients_edit"), async (req, res, next) => {
  try {
    const { rows: [f] } = await q("SELECT * FROM client_files WHERE id=$1", [req.params.fileId]);
    if (!f) return res.status(404).json({ error: "Файл не найден" });
    await assertClientAccess(req, f.client_id);
    await q("DELETE FROM client_files WHERE id=$1", [f.id]);
    unlink(join(UPLOAD_DIR, basename(f.stored_name)), () => {});   // нет файла на диске — не беда
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
