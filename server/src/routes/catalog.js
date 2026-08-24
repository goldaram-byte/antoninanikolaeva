import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can, canAny } from "../auth.js";

const r = Router();

// Настройки для шапки приложения (название, валюта) — до входа
const PUBLIC_KEYS = ["club_name", "currency"];

r.get("/settings", async (_req, res, next) => {
  try {
    const { rows } = await q("SELECT key, value FROM settings WHERE key = ANY($1)", [PUBLIC_KEYS]);
    res.json(Object.fromEntries(rows.map((s) => [s.key, s.value])));
  } catch (e) { next(e); }
});

// Дальше — только авторизованные сотрудники
r.use(employee);

// Все настройки (для экрана «Настройки»)
r.get("/settings/all", can("settings_manage"), async (_req, res, next) => {
  try {
    const { rows } = await q("SELECT key, value FROM settings ORDER BY key");
    res.json(Object.fromEntries(rows.map((s) => [s.key, s.value])));
  } catch (e) { next(e); }
});

r.put("/settings/:key", can("settings_manage"), async (req, res, next) => {
  try {
    await q("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=excluded.value",
      [req.params.key, String(req.body.value)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- Направления ---
r.get("/disciplines", async (_req, res, next) => {
  try { res.json((await q("SELECT * FROM disciplines ORDER BY name")).rows); } catch (e) { next(e); }
});
r.post("/disciplines", can("settings_manage"), async (req, res, next) => {
  try {
    const { name, color } = req.body;
    const { rows: [d] } = await q("INSERT INTO disciplines(name,color) VALUES($1,$2) RETURNING *", [name, color || "#DC2626"]);
    res.json(d);
  } catch (e) { next(e); }
});
r.delete("/disciplines/:id", can("settings_manage"), async (req, res, next) => {
  try { await q("DELETE FROM disciplines WHERE id=$1", [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

// --- Тренеры (чтение — всем сотрудникам: нужны в карточке клиента и фильтрах) ---
r.get("/trainers", async (_req, res, next) => {
  try { res.json((await q("SELECT * FROM trainers ORDER BY name")).rows); } catch (e) { next(e); }
});
r.post("/trainers", canAny("employees_manage", "settings_manage"), async (req, res, next) => {
  try {
    const { name, salary_mode, salary_fixed, percent } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ error: "Укажите имя тренера" });
    const { rows: [t] } = await q(
      "INSERT INTO trainers(name,salary_mode,salary_fixed,percent) VALUES($1,$2,$3,$4) RETURNING *",
      [name, salary_mode === "salary_percent" ? "salary_percent" : "percent", salary_fixed || 0, percent || 0]);
    res.json(t);
  } catch (e) { next(e); }
});
r.put("/trainers/:id", canAny("employees_manage", "settings_manage"), async (req, res, next) => {
  try {
    const { name, salary_mode, salary_fixed, percent } = req.body;
    const { rows: [t] } = await q(
      `UPDATE trainers SET name=COALESCE($1,name),
         salary_mode=COALESCE($2,salary_mode), salary_fixed=COALESCE($3,salary_fixed), percent=COALESCE($4,percent)
       WHERE id=$5 RETURNING *`,
      [name ?? null, salary_mode ?? null, salary_fixed ?? null, percent ?? null, req.params.id]);
    if (!t) return res.status(404).json({ error: "Тренер не найден" });
    res.json(t);
  } catch (e) { next(e); }
});
r.delete("/trainers/:id", canAny("employees_manage", "settings_manage"), async (req, res, next) => {
  try { await q("DELETE FROM trainers WHERE id=$1", [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

// --- Тарифы абонементов (базовая цена + свои цены по филиалам) ---
r.get("/subscription-types", async (_req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT t.*,
        COALESCE((SELECT json_object_agg(p.branch_id, p.price) FROM subscription_type_prices p WHERE p.sub_type_id=t.id), '{}') AS branch_prices
      FROM subscription_types t WHERE t.active ORDER BY t.price`);
    res.json(rows);
  } catch (e) { next(e); }
});

async function savePrices(c, subTypeId, branchPrices) {
  if (!branchPrices || typeof branchPrices !== "object") return;
  await c.query("DELETE FROM subscription_type_prices WHERE sub_type_id=$1", [subTypeId]);
  for (const [branchId, price] of Object.entries(branchPrices)) {
    if (price === "" || price == null) continue;                      // пусто = базовая цена
    await c.query("INSERT INTO subscription_type_prices(sub_type_id,branch_id,price) VALUES($1,$2,$3)", [subTypeId, branchId, Number(price)]);
  }
}

r.post("/subscription-types", can("subs_manage"), async (req, res, next) => {
  try {
    const { name, kind, sessions, days, price, discipline_id, training_type, branch_prices } = req.body;
    const s = await tx(async (c) => {
      const { rows: [row] } = await c.query(
        "INSERT INTO subscription_types(name,kind,sessions,days,price,discipline_id,training_type) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [name, kind || "sessions", sessions || 0, days || 30, price || 0, discipline_id || null,
         training_type === "personal" ? "personal" : "group"]);
      await savePrices(c, row.id, branch_prices);
      return row;
    });
    res.json(s);
  } catch (e) { next(e); }
});

r.put("/subscription-types/:id", can("subs_manage"), async (req, res, next) => {
  try {
    const { name, kind, sessions, days, price, discipline_id, training_type, branch_prices } = req.body;
    const s = await tx(async (c) => {
      const { rows: [row] } = await c.query(
        `UPDATE subscription_types SET name=COALESCE($1,name), kind=COALESCE($2,kind),
           sessions=COALESCE($3,sessions), days=COALESCE($4,days), price=COALESCE($5,price),
           discipline_id=$6, training_type=COALESCE($7,training_type) WHERE id=$8 RETURNING *`,
        [name ?? null, kind ?? null, sessions ?? null, days ?? null, price ?? null, discipline_id || null,
         training_type ? (training_type === "personal" ? "personal" : "group") : null, req.params.id]);
      if (row) await savePrices(c, row.id, branch_prices);
      return row;
    });
    if (!s) return res.status(404).json({ error: "Тариф не найден" });
    res.json(s);
  } catch (e) { next(e); }
});

r.delete("/subscription-types/:id", can("subs_manage"), async (req, res, next) => {
  try {
    // выданные абонементы не трогаем — тариф просто скрывается из каталога
    await q("UPDATE subscription_types SET active=false WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
