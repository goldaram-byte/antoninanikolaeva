import { Router } from "express";
import { q } from "../db.js";
import { employee } from "../auth.js";

const r = Router();
r.use(employee);

// Сводка для дашборда: цифры по выбранному филиалу (или по всем) + разбивка по филиалам
r.get("/", async (req, res, next) => {
  try {
    const branchId = req.query.branch_id || null;

    const { rows: [tot] } = await q(
      `SELECT
         (SELECT count(*)::int FROM clients c WHERE $1::uuid IS NULL OR c.branch_id=$1) AS clients,
         (SELECT count(*)::int FROM client_subscriptions s JOIN clients c ON c.id=s.client_id
           WHERE s.status='active' AND s.expiry_date >= CURRENT_DATE
             AND (s.kind='unlimited' OR s.sessions_used < s.sessions_total)
             AND ($1::uuid IS NULL OR c.branch_id=$1)) AS active_subs,
         (SELECT COALESCE(sum(s.price - s.paid),0)::numeric FROM client_subscriptions s JOIN clients c ON c.id=s.client_id
           WHERE s.price > s.paid AND s.status='active' AND ($1::uuid IS NULL OR c.branch_id=$1)) AS debt,
         (SELECT count(DISTINCT s.client_id)::int FROM client_subscriptions s JOIN clients c ON c.id=s.client_id
           WHERE s.price > s.paid AND s.status='active' AND ($1::uuid IS NULL OR c.branch_id=$1)) AS debtors,
         (SELECT COALESCE(sum(p.amount),0)::numeric FROM payments p
           WHERE p.status='succeeded' AND p.op_type='payment' AND p.counts_revenue
             AND p.created_at >= date_trunc('month', CURRENT_DATE)
             AND ($1::uuid IS NULL OR p.branch_id=$1)) AS month_income`, [branchId]);

    // Разбивка по каждому филиалу (для сводной таблицы «по всем филиалам»)
    const byBranch = (await q(
      `SELECT b.id, b.name, b.address,
         (SELECT count(*)::int FROM clients c WHERE c.branch_id=b.id) AS clients,
         (SELECT count(*)::int FROM client_subscriptions s JOIN clients c ON c.id=s.client_id
           WHERE c.branch_id=b.id AND s.status='active' AND s.expiry_date >= CURRENT_DATE
             AND (s.kind='unlimited' OR s.sessions_used < s.sessions_total)) AS active_subs,
         (SELECT COALESCE(sum(s.price - s.paid),0)::numeric FROM client_subscriptions s JOIN clients c ON c.id=s.client_id
           WHERE c.branch_id=b.id AND s.price > s.paid AND s.status='active') AS debt,
         (SELECT COALESCE(sum(p.amount),0)::numeric FROM payments p
           WHERE p.branch_id=b.id AND p.status='succeeded' AND p.op_type='payment' AND p.counts_revenue
             AND p.created_at >= date_trunc('month', CURRENT_DATE)) AS month_income
       FROM branches b ORDER BY b.sort, b.name`)).rows;

    // Последние оплаты (с учётом фильтра филиала)
    const lastPayments = (await q(
      `SELECT p.id, p.amount, p.method, p.created_at, p.client_id, c.name AS client_name, b.name AS branch_name
       FROM payments p JOIN clients c ON c.id=p.client_id LEFT JOIN branches b ON b.id=p.branch_id
       WHERE p.status='succeeded' AND p.op_type='payment' AND p.counts_revenue
         AND ($1::uuid IS NULL OR p.branch_id=$1)
       ORDER BY p.created_at DESC LIMIT 8`, [branchId])).rows;

    res.json({
      clients: tot.clients, active_subs: tot.active_subs, debt: Number(tot.debt),
      debtors: tot.debtors, month_income: Number(tot.month_income),
      byBranch: byBranch.map((b) => ({ ...b, debt: Number(b.debt), month_income: Number(b.month_income) })),
      lastPayments,
    });
  } catch (e) { next(e); }
});

export default r;
