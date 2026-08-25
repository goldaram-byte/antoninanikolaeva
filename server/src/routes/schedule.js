import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee);

// Недельная сетка (с фильтрами по филиалу и тренеру)
r.get("/", can("schedule_view"), async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || null;
    const trainerId = req.query.trainer_id || null;
    const { rows } = await q(
      `SELECT s.*, d.name AS discipline_name, d.color AS discipline_color,
              t.name AS trainer_name, b.name AS branch_name,
              (SELECT count(*)::int FROM client_sessions cs WHERE cs.session_id=s.id) AS members
       FROM sessions s
       LEFT JOIN disciplines d ON d.id=s.discipline_id
       LEFT JOIN trainers t ON t.id=s.trainer_id
       LEFT JOIN branches b ON b.id=s.branch_id
       WHERE ($1::uuid IS NULL OR s.branch_id=$1)
         AND ($2::uuid IS NULL OR s.trainer_id=$2)
       ORDER BY s.day_of_week, s.start_time`, [branchId, trainerId]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Создать занятие сразу в несколько дней недели (группа занятий)
r.post("/", can("schedule_edit"), async (req, res, next) => {
  try {
    const { branch_id, discipline_id, trainer_id, title, days, start_time, end_time, capacity, room } = req.body;
    if (!Array.isArray(days) || days.length === 0) return res.status(400).json({ error: "Выберите хотя бы один день недели" });
    if (!start_time || !end_time) return res.status(400).json({ error: "Укажите время начала и конца" });
    const created = await tx(async (c) => {
      const out = [];
      for (const d of days) {
        const { rows: [s] } = await c.query(
          "INSERT INTO sessions(branch_id,discipline_id,trainer_id,title,day_of_week,start_time,end_time,capacity,room) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [branch_id || null, discipline_id || null, trainer_id || null, title || "", d, start_time, end_time, capacity || 12, room || ""]);
        out.push(s);
      }
      return out;
    });
    res.json({ created: created.length, sessions: created });
  } catch (e) { next(e); }
});

// Изменить серию занятий (все повторения этого занятия)
r.put("/:id", can("schedule_edit"), async (req, res, next) => {
  try {
    const { branch_id, discipline_id, trainer_id, title, day_of_week, start_time, end_time, capacity, room } = req.body;
    const { rows: [s] } = await q(
      `UPDATE sessions SET branch_id=$1, discipline_id=$2, trainer_id=$3, title=$4,
         day_of_week=COALESCE($5,day_of_week), start_time=COALESCE($6,start_time), end_time=COALESCE($7,end_time),
         capacity=COALESCE($8,capacity), room=COALESCE($9,room)
       WHERE id=$10 RETURNING *`,
      [branch_id || null, discipline_id || null, trainer_id || null, title || "",
       day_of_week ?? null, start_time || null, end_time || null, capacity ?? null, room ?? null, req.params.id]);
    if (!s) return res.status(404).json({ error: "Занятие не найдено" });
    res.json(s);
  } catch (e) { next(e); }
});

r.delete("/:id", can("schedule_edit"), async (req, res, next) => {
  try { await q("DELETE FROM sessions WHERE id=$1", [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

// --- Разовые изменения одного занятия (на конкретную дату) ---
r.get("/exceptions", can("schedule_view"), async (_req, res, next) => {
  try {
    res.json((await q(
      `SELECT e.*, s.title, s.start_time AS orig_start, s.day_of_week, d.name AS discipline_name, b.name AS branch_name
       FROM session_exceptions e
       JOIN sessions s ON s.id=e.session_id
       LEFT JOIN disciplines d ON d.id=s.discipline_id
       LEFT JOIN branches b ON b.id=s.branch_id
       WHERE e.date >= CURRENT_DATE - 1 ORDER BY e.date`)).rows);
  } catch (e) { next(e); }
});

r.post("/:id/exceptions", can("schedule_edit"), async (req, res, next) => {
  try {
    const { date, kind = "cancelled", new_start = null, new_end = null, note = "" } = req.body;
    if (!date) return res.status(400).json({ error: "Укажите дату" });
    if (kind === "moved" && !new_start) return res.status(400).json({ error: "Укажите новое время" });
    const { rows: [e] } = await q(
      "INSERT INTO session_exceptions(session_id,date,kind,new_start,new_end,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [req.params.id, date, kind === "moved" ? "moved" : "cancelled", new_start, new_end, note || ""]);
    res.json(e);
  } catch (e) { next(e); }
});

r.delete("/exceptions/:eid", can("schedule_edit"), async (req, res, next) => {
  try { await q("DELETE FROM session_exceptions WHERE id=$1", [req.params.eid]); res.json({ ok: true }); } catch (e) { next(e); }
});

export default r;
