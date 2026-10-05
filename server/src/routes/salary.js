import { Router } from "express";
import { q } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee, can("reports_salary"));

// Расчёт зарплаты за месяц (month=YYYY-MM).
// Оплата относится к месяцу, за который куплен абонемент (дата его начала),
// а не к дате платежа: абонемент за сентябрь, оплаченный в октябре,
// идёт в сентябрьскую зарплату.
// База — оплаты (приход, реальные деньги) за месяц по абонементам, привязанным к тренеру.
// Схема тренера: percent — только % от оплат; salary_percent — оклад + % от оплат.
r.get("/", async (req, res, next) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const from = `${month}-01`;
    const { rows: trainers } = await q("SELECT * FROM trainers ORDER BY name");
    const { rows: sums } = await q(
      `SELECT s.trainer_id, COALESCE(sum(p.amount),0)::numeric AS revenue, count(p.id)::int AS ops
       FROM payments p
       JOIN client_subscriptions s ON s.id = p.client_sub_id
       WHERE p.status='succeeded' AND p.op_type='payment' AND p.counts_revenue
         AND s.trainer_id IS NOT NULL
         AND s.purchase_date >= $1::date AND s.purchase_date < ($1::date + interval '1 month')
       GROUP BY s.trainer_id`, [from]);
    const byTrainer = Object.fromEntries(sums.map((s) => [s.trainer_id, s]));

    const list = trainers.map((t) => {
      const rev = Number(byTrainer[t.id]?.revenue || 0);
      const fromPercent = Math.round(rev * Number(t.percent) / 100);
      const base = t.salary_mode === "salary_percent" ? Number(t.salary_fixed) : 0;
      return {
        id: t.id, name: t.name, salary_mode: t.salary_mode,
        percent: Number(t.percent), salary_fixed: Number(t.salary_fixed),
        revenue: rev, ops: byTrainer[t.id]?.ops || 0,
        from_percent: fromPercent, base, total: base + fromPercent,
      };
    });
    res.json({ month, trainers: list, total: list.reduce((a, t) => a + t.total, 0) });
  } catch (e) { next(e); }
});

// Детализация оплат тренера за месяц
r.get("/:trainerId/details", async (req, res, next) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const from = `${month}-01`;
    const { rows } = await q(
      `SELECT p.id, p.amount, p.method, p.created_at, c.name AS client_name, c.id AS client_id, s.name AS sub_name
       FROM payments p
       JOIN client_subscriptions s ON s.id = p.client_sub_id
       JOIN clients c ON c.id = p.client_id
       WHERE p.status='succeeded' AND p.op_type='payment' AND p.counts_revenue
         AND s.trainer_id = $1
         AND s.purchase_date >= $2::date AND s.purchase_date < ($2::date + interval '1 month')
       ORDER BY p.created_at DESC`, [req.params.trainerId, from]);
    res.json(rows);
  } catch (e) { next(e); }
});

export default r;
