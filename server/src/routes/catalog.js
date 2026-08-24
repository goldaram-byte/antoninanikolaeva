import { Router } from "express";
import { q } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();

// Публичные ключи настроек — их видит и кабинет клиента без входа сотрудника
const PUBLIC_KEYS = ["club_name", "currency"];

r.get("/settings", async (_req, res, next) => {
  try {
    const { rows } = await q("SELECT key, value FROM settings WHERE key = ANY($1)", [PUBLIC_KEYS]);
    res.json(Object.fromEntries(rows.map((s) => [s.key, s.value])));
  } catch (e) { next(e); }
});

// Все настройки — только для сотрудника с правом settings_manage
r.get("/settings/all", employee, can("settings_manage"), async (_req, res, next) => {
  try {
    const { rows } = await q("SELECT key, value FROM settings ORDER BY key");
    res.json(Object.fromEntries(rows.map((s) => [s.key, s.value])));
  } catch (e) { next(e); }
});

r.put("/settings", employee, can("settings_manage"), async (req, res, next) => {
  try {
    for (const [k, v] of Object.entries(req.body || {}))
      await q("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2", [k, String(v)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.get("/disciplines", employee, async (_req, res, next) => {
  try {
    res.json((await q("SELECT * FROM disciplines ORDER BY name")).rows);
  } catch (e) { next(e); }
});

export default r;
