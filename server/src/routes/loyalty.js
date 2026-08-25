import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee, can("loyalty_view"));

// Сводка лояльности: баллы на руках и рейтинг приглашений.
// Приглашённый засчитывается в «пришли и оплатили», только если у него есть ОПЛАЧЕННЫЙ абонемент (paid > 0).
r.get("/summary", async (_req, res, next) => {
  try {
    const { rows: [tot] } = await q(
      `SELECT COALESCE(sum(bonus_points),0)::int AS points_total,
              count(*) FILTER (WHERE bonus_points > 0)::int AS holders
       FROM clients`);
    const leaders = (await q(
      `SELECT c.id, c.name, c.referral_code, b.name AS branch_name,
              count(r.id)::int AS invited_total,
              count(r.id) FILTER (WHERE EXISTS (
                SELECT 1 FROM client_subscriptions s WHERE s.client_id = r.referred_id AND s.paid > 0))::int AS invited_paid,
              COALESCE(sum(r.reward_points),0)::int AS reward_points
       FROM clients c
       JOIN referrals r ON r.referrer_id = c.id
       LEFT JOIN branches b ON b.id = c.branch_id
       GROUP BY c.id, c.name, c.referral_code, b.name
       ORDER BY invited_paid DESC, invited_total DESC, c.name
       LIMIT 50`)).rows;
    const { rows: [pct] } = await q("SELECT value FROM settings WHERE key='referral_referrer_percent'");
    res.json({ points_total: tot.points_total, holders: tot.holders, leaders, referral_percent: pct?.value ?? "0" });
  } catch (e) { next(e); }
});

// Последние операции с баллами (по всем клиентам)
r.get("/transactions", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { rows } = await q(
      `SELECT l.*, c.name AS client_name FROM loyalty_transactions l
       JOIN clients c ON c.id = l.client_id
       ORDER BY l.created_at DESC LIMIT $1`, [limit]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Ручная корректировка баллов (+ начислить / − списать) с записью в историю
r.post("/adjust", async (req, res, next) => {
  try {
    const { client_id, points, reason } = req.body;
    const pts = Math.trunc(Number(points));
    if (!client_id || !pts) return res.status(400).json({ error: "Укажите клиента и количество баллов (±)" });
    const result = await tx(async (c) => {
      const { rows: [cl] } = await c.query("SELECT id, name, bonus_points FROM clients WHERE id=$1 FOR UPDATE", [client_id]);
      if (!cl) throw Object.assign(new Error("Клиент не найден"), { status: 404 });
      if (cl.bonus_points + pts < 0) throw Object.assign(new Error(`У клиента только ${cl.bonus_points} баллов`), { status: 400 });
      await c.query("UPDATE clients SET bonus_points = bonus_points + $1 WHERE id=$2", [pts, client_id]);
      await c.query("INSERT INTO loyalty_transactions(client_id, points, reason) VALUES($1,$2,$3)",
        [client_id, pts, reason?.trim() || `Корректировка (${req.user.name || "админ"})`]);
      const { rows: [u] } = await c.query("SELECT bonus_points FROM clients WHERE id=$1", [client_id]);
      return { ok: true, bonus_points: u.bonus_points };
    });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

export default r;
