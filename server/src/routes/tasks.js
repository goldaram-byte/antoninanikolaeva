import { Router } from "express";
import { q } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee, can("clients_view"));

// Общий список задач: по клиентам + по лидам воронки
r.get("/", async (req, res, next) => {
  try {
    const done = req.query.done === "1";
    const { rows } = await q(
      `SELECT t.id, t.title, t.due_date, t.note, t.done, t.author, t.created_at,
              'client' AS kind, c.id AS target_id, c.name AS target_name
       FROM client_tasks t JOIN clients c ON c.id=t.client_id
       WHERE t.done=$1
       UNION ALL
       SELECT t.id, t.title, t.due_date, t.note, t.done, t.author, t.created_at,
              'lead' AS kind, l.id AS target_id, l.name AS target_name
       FROM lead_tasks t JOIN leads l ON l.id=t.lead_id
       WHERE t.done=$1
       ORDER BY due_date NULLS LAST, created_at`, [done]);
    res.json(rows);
  } catch (e) { next(e); }
});

r.post("/", async (req, res, next) => {
  try {
    const { client_id, title, due_date, note = "" } = req.body;
    if (!client_id || !String(title || "").trim()) return res.status(400).json({ error: "Укажите клиента и название" });
    const { rows: [t] } = await q(
      "INSERT INTO client_tasks(client_id, title, due_date, note, author) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [client_id, title.trim(), due_date || null, note, req.user.name || ""]);
    res.json(t);
  } catch (e) { next(e); }
});

// Отметить выполненной / вернуть в работу (kind: client | lead)
r.patch("/:kind/:id", async (req, res, next) => {
  try {
    const table = req.params.kind === "lead" ? "lead_tasks" : "client_tasks";
    const done = !!req.body?.done;
    const { rows: [t] } = await q(
      `UPDATE ${table} SET done=$1, done_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2 RETURNING *`,
      [done, req.params.id]);
    res.json(t);
  } catch (e) { next(e); }
});

r.delete("/:kind/:id", async (req, res, next) => {
  try {
    const table = req.params.kind === "lead" ? "lead_tasks" : "client_tasks";
    await q(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
