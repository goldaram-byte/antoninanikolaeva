import { Router } from "express";
import { q } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee);

// Список филиалов нужен всем сотрудникам (фильтры, формы)
r.get("/", async (_req, res, next) => {
  try { res.json((await q("SELECT * FROM branches ORDER BY sort, name")).rows); } catch (e) { next(e); }
});

r.post("/", can("settings_manage"), async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Укажите название филиала" });
    const { rows: [{ mx }] } = await q("SELECT COALESCE(MAX(sort),-1)+1 AS mx FROM branches");
    const { rows: [b] } = await q("INSERT INTO branches(name,address,sort) VALUES($1,$2,$3) RETURNING *",
      [name, String(req.body?.address || "").trim(), mx]);
    res.json(b);
  } catch (e) { next(e); }
});

r.put("/:id", can("settings_manage"), async (req, res, next) => {
  try {
    const { name, address, sort } = req.body;
    const { rows: [b] } = await q(
      "UPDATE branches SET name=COALESCE($1,name), address=COALESCE($2,address), sort=COALESCE($3,sort) WHERE id=$4 RETURNING *",
      [name ?? null, address ?? null, sort ?? null, req.params.id]);
    if (!b) return res.status(404).json({ error: "Филиал не найден" });
    res.json(b);
  } catch (e) { next(e); }
});

// Удаление. Клиенты/абонементы/оплаты не удаляются — у них просто очищается филиал.
r.delete("/:id", can("settings_manage"), async (req, res, next) => {
  try {
    const { rows: [{ cnt }] } = await q("SELECT count(*)::int AS cnt FROM clients WHERE branch_id=$1", [req.params.id]);
    if (cnt > 0 && req.query.force !== "1")
      return res.status(409).json({ error: `К филиалу привязано клиентов: ${cnt}. Удалить всё равно? (привязка у них очистится)`, needsForce: true });
    await q("DELETE FROM branches WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
