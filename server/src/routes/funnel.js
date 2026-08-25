import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee, can("leads_manage"));

const refCode = () => "REF" + Math.random().toString(36).slice(2, 8).toUpperCase();

r.get("/stages", async (_req, res, next) => {
  try { res.json((await q("SELECT * FROM funnel_stages ORDER BY sort")).rows); } catch (e) { next(e); }
});

// Лиды (с фильтром по филиалу)
r.get("/leads", async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || null;
    const { rows } = await q(
      `SELECT l.*, b.name AS branch_name, d.name AS discipline_name,
              rc.name AS referrer_name, c.name AS client_name,
              (SELECT count(*)::int FROM lead_tasks t WHERE t.lead_id=l.id AND NOT t.done) AS open_tasks
       FROM leads l
       LEFT JOIN branches b ON b.id=l.branch_id
       LEFT JOIN disciplines d ON d.id=l.discipline_id
       LEFT JOIN clients rc ON rc.id=l.referred_by
       LEFT JOIN clients c ON c.id=l.client_id
       WHERE ($1::uuid IS NULL OR l.branch_id=$1)
       ORDER BY l.sort, l.created_at DESC`, [branchId]);
    res.json(rows);
  } catch (e) { next(e); }
});

r.post("/leads", async (req, res, next) => {
  try {
    const { name, phone, branch_id, discipline_id, comment = "", referral_code, stage_id } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ error: "Укажите имя" });
    // «кто пригласил» — по реферальному коду клиента
    let referrerId = null;
    if (referral_code) {
      const { rows: [ref] } = await q("SELECT id FROM clients WHERE referral_code=$1", [String(referral_code).trim().toUpperCase()]);
      referrerId = ref?.id || null;
    }
    const { rows: [first] } = await q("SELECT id FROM funnel_stages WHERE NOT is_won AND NOT is_lost ORDER BY sort LIMIT 1");
    const { rows: [l] } = await q(
      `INSERT INTO leads(name, phone, branch_id, discipline_id, comment, referred_by, stage_id)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name.trim(), phone || null, branch_id || null, discipline_id || null, comment, referrerId, stage_id || first?.id || null]);
    res.json(l);
  } catch (e) { next(e); }
});

r.put("/leads/:id", async (req, res, next) => {
  try {
    const { name, phone, branch_id, discipline_id, comment, stage_id } = req.body;
    const { rows: [l] } = await q(
      `UPDATE leads SET name=COALESCE($1,name), phone=$2, branch_id=$3, discipline_id=$4,
         comment=COALESCE($5,comment), stage_id=COALESCE($6::uuid,stage_id)
       WHERE id=$7 RETURNING *`,
      [name ?? null, phone || null, branch_id || null, discipline_id || null, comment ?? null, stage_id || null, req.params.id]);
    if (!l) return res.status(404).json({ error: "Заявка не найдена" });
    res.json(l);
  } catch (e) { next(e); }
});

// Перемещение по этапам воронки
r.post("/leads/:id/move", async (req, res, next) => {
  try {
    const { stage_id } = req.body;
    const { rows: [l] } = await q("UPDATE leads SET stage_id=$1 WHERE id=$2 RETURNING *", [stage_id, req.params.id]);
    res.json(l);
  } catch (e) { next(e); }
});

r.delete("/leads/:id", async (req, res, next) => {
  try { await q("DELETE FROM leads WHERE id=$1", [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

// ===== КОНВЕРСИЯ В КЛИЕНТА =====
// Одним действием: создаёт клиента (или привязывает к существующему по телефону),
// ОБЯЗАТЕЛЬНО переносит «кто пригласил» и создаёт запись в referrals (баг образца — здесь не повторяем),
// переносит филиал и направление, ставит лиду этап «Пришёл».
r.post("/leads/:id/convert", async (req, res, next) => {
  try {
    const result = await tx(async (c) => {
      const { rows: [l] } = await c.query("SELECT * FROM leads WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!l) throw Object.assign(new Error("Заявка не найдена"), { status: 404 });
      if (l.client_id) {
        const { rows: [ex] } = await c.query("SELECT id, name FROM clients WHERE id=$1", [l.client_id]);
        return { client: ex, already: true };
      }

      // если клиент с таким телефоном уже есть — привязываем к нему
      let client = null;
      const digits = String(l.phone || "").replace(/\D/g, "");
      if (digits) {
        const norm = digits.length === 11 && digits[0] === "8" ? "7" + digits.slice(1) : digits;
        const { rows } = await c.query(
          "SELECT * FROM clients WHERE regexp_replace(coalesce(phone,''), '\\D', '', 'g') IN ($1, $2)",
          [norm, norm[0] === "7" ? "8" + norm.slice(1) : norm]);
        client = rows[0] || null;
      }

      if (!client) {
        const { rows: [n] } = await c.query(
          `INSERT INTO clients(name, phone, branch_id, referral_code, referred_by, notes)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
          [l.name, l.phone || null, l.branch_id, refCode(), l.referred_by, l.comment ? `Из заявки: ${l.comment}` : ""]);
        client = n;
      } else if (l.referred_by && !client.referred_by) {
        // перенос пригласившего и на существующего клиента, если у него ещё не задан
        await c.query("UPDATE clients SET referred_by=$1 WHERE id=$2", [l.referred_by, client.id]);
        client.referred_by = l.referred_by;
      }

      // запись в referrals — без неё бонусы пригласившему не начислятся
      if (client.referred_by && client.referred_by !== client.id) {
        await c.query("INSERT INTO referrals(referrer_id, referred_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [client.referred_by, client.id]);
      }
      // перенос направления
      if (l.discipline_id) {
        await c.query("INSERT INTO client_disciplines(client_id, discipline_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [client.id, l.discipline_id]);
      }

      const { rows: [won] } = await c.query("SELECT id FROM funnel_stages WHERE is_won ORDER BY sort LIMIT 1");
      await c.query("UPDATE leads SET client_id=$1, stage_id=COALESCE($2, stage_id) WHERE id=$3", [client.id, won?.id || null, l.id]);
      return { client, already: false };
    });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ===== Примечания по лиду =====
r.get("/leads/:id/notes", async (req, res, next) => {
  try { res.json((await q("SELECT * FROM lead_notes WHERE lead_id=$1 ORDER BY created_at DESC", [req.params.id])).rows); }
  catch (e) { next(e); }
});
r.post("/leads/:id/notes", async (req, res, next) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Пустое примечание" });
    const { rows: [n] } = await q("INSERT INTO lead_notes(lead_id, text, author) VALUES($1,$2,$3) RETURNING *",
      [req.params.id, text, req.user.name || ""]);
    res.json(n);
  } catch (e) { next(e); }
});

// ===== Задачи по лиду =====
r.get("/leads/:id/tasks", async (req, res, next) => {
  try { res.json((await q("SELECT * FROM lead_tasks WHERE lead_id=$1 ORDER BY done, due_date NULLS LAST, created_at", [req.params.id])).rows); }
  catch (e) { next(e); }
});
r.post("/leads/:id/tasks", async (req, res, next) => {
  try {
    const { title, due_date, note = "" } = req.body;
    if (!String(title || "").trim()) return res.status(400).json({ error: "Укажите название задачи" });
    const { rows: [t] } = await q(
      "INSERT INTO lead_tasks(lead_id, title, due_date, note, author) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [req.params.id, title.trim(), due_date || null, note, req.user.name || ""]);
    res.json(t);
  } catch (e) { next(e); }
});
r.patch("/tasks/:taskId", async (req, res, next) => {
  try {
    const done = !!req.body?.done;
    const { rows: [t] } = await q(
      "UPDATE lead_tasks SET done=$1, done_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2 RETURNING *",
      [done, req.params.taskId]);
    res.json(t);
  } catch (e) { next(e); }
});
r.delete("/tasks/:taskId", async (req, res, next) => {
  try { await q("DELETE FROM lead_tasks WHERE id=$1", [req.params.taskId]); res.json({ ok: true }); } catch (e) { next(e); }
});

export default r;
