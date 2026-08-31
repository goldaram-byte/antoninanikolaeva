import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import iconv from "iconv-lite";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee, can("clients_edit"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const refCode = () => "REF" + Math.random().toString(36).slice(2, 8).toUpperCase();

// Ячейка Excel → строка (даты, формулы, форматированный текст)
function cellToString(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (v.text) return String(v.text);
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.result != null) return cellToString(v.result);
    if (v.hyperlink) return String(v.text || v.hyperlink);
    return String(v);
  }
  return String(v).trim();
}

// Разбор файла (.xlsx или .csv) в таблицу строк
async function parseTable(file) {
  const name = (file.originalname || "").toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    // русский Excel часто сохраняет CSV в кодировке Windows-1251
    let text = file.buffer.toString("utf8");
    if (text.includes("�")) text = iconv.decode(file.buffer, "win1251");
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    const delim = (lines[0]?.split(";").length || 0) > (lines[0]?.split(",").length || 0) ? ";" : ",";
    // простой CSV-разбор с поддержкой кавычек
    const parseLine = (line) => {
      const out = []; let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === delim) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    return lines.map(parseLine);
  }
  // .xlsx
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw Object.assign(new Error("В файле нет листов"), { status: 400 });
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) vals.push(cellToString(row.getCell(c).value));
    rows.push(vals);
  });
  return rows;
}

const normPhone = (raw) => {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  return d;
};

function parseBirthdate(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);                    // 2015-04-30
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);        // 30.04.2015 / 30/04/15
  if (m) {
    let y = m[3].length === 2 ? (Number(m[3]) > 30 ? "19" + m[3] : "20" + m[3]) : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// «01.09.2024 12:30» / «2024-09-01» → дата регистрации клиента
function parseDateTime(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")} ${(m[4] || "00").padStart(2, "0")}:${m[5] || "00"}`;
  const d = new Date(t);
  return isNaN(d) ? null : d.toISOString();
}

// «Неактивный», «архив», «ушёл» → inactive, всё остальное → active
function parseStatus(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return "active";
  return /неактив|не актив|архив|ушел|ушёл|отказ|заморож|бывш|расторг/.test(t) ? "inactive" : "active";
}

// «Муж» / «М» / «male» → m, «Жен» / «Ж» → f
function parseGender(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return null;
  if (/^(м|муж|мужской|m|male)/.test(t)) return "m";
  if (/^(ж|жен|женский|f|w|female)/.test(t)) return "f";
  return null;
}

// Предпросмотр: заголовки и первые строки, чтобы настроить сопоставление колонок
r.post("/clients/preview", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Файл не получен" });
    const rows = await parseTable(req.file);
    if (rows.length === 0) return res.status(400).json({ error: "Файл пустой" });
    const width = Math.max(...rows.map((x) => x.length));
    const headers = rows[0].concat(Array(Math.max(0, width - rows[0].length)).fill(""));
    const body = rows.slice(1);
    // сколько значений реально заполнено в каждой колонке — чтобы в мастере
    // сразу было видно, где данные есть, а какие колонки в файле пустые
    const filled = headers.map((_, i) => body.filter((r) => String(r[i] ?? "").trim() !== "").length);
    // Для колонок-справочников (филиал, ответственный, статус) возвращаем список
    // различных значений — в мастере их сопоставляют с сотрудниками школы.
    const options = headers.map((_, i) => {
      const set = new Set();
      for (const r of body) {
        const v = String(r[i] ?? "").trim();
        if (v) set.add(v);
        if (set.size > 30) return null;                 // не справочник, а обычные данные
      }
      return [...set].sort((a, b) => a.localeCompare(b, "ru"));
    });
    res.json({ headers, filled, options, rows: body.slice(0, 6), total: body.length });
  } catch (e) { res.status(e.status || 500).json({ error: "Не удалось прочитать файл: " + e.message }); }
});

// Импорт. mapping — JSON-массив по колонкам файла:
//   name | phone | email | birthdate | gender | discount | branch_name |
//   parent_name | parent_phone | source | external_id | created_at |
//   manager | status | note | note_titled | skip
// note_titled кладёт в заметки «Название колонки: значение» — так можно
// импортировать любые дополнительные столбцы (группа, родитель, пояс и т.п.).
// При update_existing=1 уже заведённые клиенты (по ID прежней CRM или телефону)
// не пропускаются, а дополняются: пустые значения в файле ничего не затирают.
// branch_name берёт филиал из самой строки (выгрузки из других CRM обычно
// содержат колонку с филиалом) — при create_branches=1 недостающие создаются.
r.post("/clients", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Файл не получен" });
    let mapping;
    try { mapping = JSON.parse(req.body.mapping || "[]"); } catch { mapping = []; }
    if (!mapping.includes("name")) return res.status(400).json({ error: "Не выбрана колонка с именем клиента" });
    const branchId = req.body.branch_id || null;          // филиал по умолчанию
    const skipDup = req.body.skip_duplicates !== "0";
    const updateExisting = req.body.update_existing === "1";   // дополнять уже заведённых
    const hasHeader = req.body.has_header !== "0";
    const createBranches = req.body.create_branches === "1";

    const rows = await parseTable(req.file);
    const data = hasHeader ? rows.slice(1) : rows;
    const headers = hasHeader ? rows[0] : mapping.map((_, i) => `Колонка ${i + 1}`);

    // справочник филиалов по названию (для колонки «Филиал»)
    const branchByName = new Map();
    for (const b of (await q("SELECT id, name FROM branches")).rows)
      branchByName.set(b.name.trim().toLowerCase(), b.id);
    const createdBranches = [];

    // телефоны клиентов, уже заведённых в базе (для пропуска или обновления дубликатов)
    const idByPhone = new Map();
    for (const x of (await q(
      `SELECT id, regexp_replace(coalesce(phone,''), '\\D', '', 'g') AS p FROM clients WHERE phone IS NOT NULL`)).rows) {
      const ph = x.p.length === 11 && x.p[0] === "8" ? "7" + x.p.slice(1) : x.p;
      if (ph) idByPhone.set(ph, x.id);
    }
    // сотрудники — для колонки «Ответственный» (ищем по имени или почте)
    const adminByName = new Map();
    for (const a of (await q("SELECT id, name, email FROM admins")).rows) {
      if (a.name) adminByName.set(a.name.trim().toLowerCase(), a.id);
      adminByName.set(a.email.trim().toLowerCase(), a.id);
      adminByName.set(a.email.split("@")[0].trim().toLowerCase(), a.id);
    }
    const managersNotFound = new Set();
    // ручное сопоставление из мастера: { "значение в файле": "id сотрудника" | "" }
    let managerMap = {};
    try { managerMap = JSON.parse(req.body.manager_map || "{}") || {}; } catch { managerMap = {}; }
    const managerByValue = new Map(
      Object.entries(managerMap).map(([k, v]) => [String(k).trim().toLowerCase(), v || null]));

    // ID из прежней CRM — по ним дубликаты ловятся даже у клиентов без телефона
    const idByExt = new Map(
      (await q("SELECT id, external_id FROM clients WHERE external_id IS NOT NULL")).rows
        .map((x) => [x.external_id, x.id]));

    let created = 0, skipped = 0, updated = 0;
    const errors = [];
    await tx(async (c) => {
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + (hasHeader ? 2 : 1);
        const get = (field) => {
          const parts = [];
          mapping.forEach((m, col) => { if (m === field && row[col] != null && String(row[col]).trim() !== "") parts.push(String(row[col]).trim()); });
          return parts.join(" ");
        };
        const name = get("name");
        if (!name) { if (row.some((x) => String(x || "").trim() !== "")) errors.push({ row: rowNum, reason: "нет имени" }); continue; }

        const phoneRaw = get("phone");
        const pn = normPhone(phoneRaw);
        const extId = get("external_id") || null;
        // клиент, уже заведённый в базе: ищем по ID прежней CRM, затем по телефону
        const dupId = (extId && idByExt.get(extId)) || (pn && idByPhone.get(pn)) || null;
        if (dupId && !updateExisting && skipDup) { skipped++; continue; }

        const noteParts = [];
        mapping.forEach((m, col) => {
          const v = String(row[col] ?? "").trim();
          if (!v) return;
          if (m === "note") noteParts.push(v);
          // нули («Баланс: 0», «Посещений: 0») в заметки не пишем — это шум
          if (m === "note_titled" && v !== "0") noteParts.push(`${headers[col] || "Колонка " + (col + 1)}: ${v}`);
        });

        const discount = Number(String(get("discount")).replace(",", ".").replace(/[^\d.]/g, "")) || 0;

        // филиал: из колонки файла, иначе выбранный в форме
        let rowBranch = branchId;
        const branchName = get("branch_name");
        if (branchName) {
          const key = branchName.trim().toLowerCase();
          if (branchByName.has(key)) rowBranch = branchByName.get(key);
          else if (createBranches) {
            const { rows: [{ mx }] } = await c.query("SELECT COALESCE(MAX(sort),-1)+1 AS mx FROM branches");
            const { rows: [nb] } = await c.query(
              "INSERT INTO branches(name, address, sort) VALUES($1,'',$2) RETURNING id, name", [branchName.trim(), mx]);
            branchByName.set(key, nb.id);
            createdBranches.push(nb.name);
            rowBranch = nb.id;
          }
        }

        // ответственный сотрудник: сопоставляем по имени или почте
        let managerId = null;
        const managerRaw = get("manager");
        if (managerRaw) {
          const key = managerRaw.trim().toLowerCase();
          // сначала то, что выбрали руками в мастере, потом совпадение по имени/почте
          managerId = managerByValue.has(key) ? managerByValue.get(key)
                                              : (adminByName.get(key) || null);
          if (!managerId && !managerByValue.has(key)) managersNotFound.add(managerRaw.trim());
        }

        // статус трогаем, только если колонка со статусом выбрана
        const statusVal = mapping.includes("status") ? parseStatus(get("status")) : null;
        const vals = [name, phoneRaw || null, get("email") || null, parseBirthdate(get("birthdate")),
                      noteParts.join("; "), rowBranch, discount,
                      parseGender(get("gender")), get("parent_name") || null, get("parent_phone") || null,
                      get("source") || null, extId, managerId, statusVal];

        try {
          if (dupId && updateExisting) {
            // дополняем карточку: пустые значения из файла ничего не затирают
            await c.query(
              `UPDATE clients SET
                 name             = COALESCE(NULLIF($1,''), name),
                 phone            = COALESCE(NULLIF($2,''), phone),
                 email            = COALESCE(NULLIF($3,''), email),
                 birthdate        = COALESCE($4::date, birthdate),
                 notes            = CASE WHEN $5 <> '' THEN $5 ELSE notes END,
                 branch_id        = COALESCE($6::uuid, branch_id),
                 discount_percent = CASE WHEN $7::numeric > 0 THEN $7 ELSE discount_percent END,
                 gender           = COALESCE($8, gender),
                 parent_name      = COALESCE(NULLIF($9,''), parent_name),
                 parent_phone     = COALESCE(NULLIF($10,''), parent_phone),
                 source           = COALESCE(NULLIF($11,''), source),
                 external_id      = COALESCE(external_id, NULLIF($12,'')),
                 manager_id       = COALESCE($13::uuid, manager_id),
                 status           = COALESCE($14, status)
               WHERE id=$15`, [...vals, dupId]);
            updated++;
          } else {
            const { rows: [ins] } = await c.query(
              `INSERT INTO clients(name, phone, email, birthdate, notes, branch_id, discount_percent,
                                   gender, parent_name, parent_phone, source, external_id,
                                   manager_id, status, referral_code, created_at)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14,'active'), $15,
                      COALESCE($16::timestamptz, now())) RETURNING id`,
              [...vals, refCode(), parseDateTime(get("created_at"))]);
            created++;
            if (pn) idByPhone.set(pn, ins.id);
            if (extId) idByExt.set(extId, ins.id);
          }
        } catch (e) { errors.push({ row: rowNum, reason: e.message.slice(0, 80) }); }
      }
    });
    res.json({ created, updated, skipped, errors: errors.slice(0, 20), errors_total: errors.length,
               created_branches: createdBranches, managers_not_found: [...managersNotFound].slice(0, 10) });
  } catch (e) { res.status(e.status || 500).json({ error: "Импорт не удался: " + e.message }); }
});

export default r;
