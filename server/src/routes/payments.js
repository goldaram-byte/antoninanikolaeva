import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee);

const ownTrainer = (req) => (req.user.scope === "own" ? req.user.trainerId : null);

// Операции за период с фильтрами: даты, способ, филиал
r.get("/", can("finance_view"), async (req, res, next) => {
  try {
    const own = ownTrainer(req);
    const from = req.query.from || null, to = req.query.to || null;
    const method = req.query.method || null;
    const branchId = req.query.branch_id || null;
    const { rows } = await q(
      `SELECT p.*, c.name AS client_name, s.name AS sub_name, b.name AS branch_name
       FROM payments p
       JOIN clients c ON c.id=p.client_id
       LEFT JOIN client_subscriptions s ON s.id=p.client_sub_id
       LEFT JOIN branches b ON b.id=p.branch_id
       WHERE ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM client_trainers x WHERE x.client_id=p.client_id AND x.trainer_id=$1))
         AND ($2::date IS NULL OR p.created_at::date >= $2)
         AND ($3::date IS NULL OR p.created_at::date <= $3)
         AND ($4::text IS NULL OR p.method = $4)
         AND ($5::uuid IS NULL OR p.branch_id = $5)
       ORDER BY p.created_at DESC LIMIT 1000`, [own, from, to, method, branchId]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Сводка за период: приход, возвраты, нетто, разбивка по способам
r.get("/summary", can("finance_view"), async (req, res, next) => {
  try {
    const from = req.query.from || null, to = req.query.to || null;
    const branchId = req.query.branch_id || null;
    const { rows: [tot] } = await q(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status='succeeded' AND op_type='payment' AND counts_revenue),0)::numeric AS income,
         COALESCE(SUM(amount) FILTER (WHERE status='succeeded' AND op_type='refund'),0)::numeric AS refunds,
         COUNT(*) FILTER (WHERE status='succeeded') AS ops
       FROM payments
       WHERE ($1::date IS NULL OR created_at::date >= $1)
         AND ($2::date IS NULL OR created_at::date <= $2)
         AND ($3::uuid IS NULL OR branch_id = $3)`, [from, to, branchId]);
    const byMethod = (await q(
      `SELECT method, COALESCE(SUM(amount),0)::numeric AS sum FROM payments
       WHERE status='succeeded' AND op_type='payment' AND counts_revenue
         AND ($1::date IS NULL OR created_at::date >= $1)
         AND ($2::date IS NULL OR created_at::date <= $2)
         AND ($3::uuid IS NULL OR branch_id = $3)
       GROUP BY method ORDER BY sum DESC`, [from, to, branchId])).rows;
    res.json({ income: Number(tot.income), refunds: Number(tot.refunds), net: Number(tot.income) - Number(tot.refunds), ops: Number(tot.ops), byMethod });
  } catch (e) { next(e); }
});

// Должники. Правило этапа 2: абонемент выдан, но оплачен не полностью.
// Правило «закреплён в группе, но не оплатил месяц до 5 числа» добавится на этапе 3 вместе с группами.
r.get("/debtors", can("finance_view"), async (req, res, next) => {
  try {
    const own = ownTrainer(req);
    const branchId = req.query.branch_id || null;
    const { rows } = await q(
      `SELECT c.id, c.name, c.phone, b.name AS branch_name,
              sum(s.price - s.paid)::numeric AS debt,
              count(*)::int AS items,
              min(s.purchase_date) AS since,
              string_agg(s.name, ', ' ORDER BY s.purchase_date DESC) AS what
       FROM client_subscriptions s
       JOIN clients c ON c.id=s.client_id
       LEFT JOIN branches b ON b.id=c.branch_id
       WHERE s.price > s.paid AND s.status='active'
         AND ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM client_trainers x WHERE x.client_id=c.id AND x.trainer_id=$1))
         AND ($2::uuid IS NULL OR c.branch_id = $2)
       GROUP BY c.id, c.name, c.phone, b.name
       ORDER BY debt DESC, c.name`, [own, branchId]);
    res.json(rows.map((x) => ({ ...x, debt: Number(x.debt) })));
  } catch (e) { next(e); }
});

// Приём оплаты: деньги (наличные/перевод/расчётный счёт) и/или баллы.
// Сумма гасит долг указанного абонемента, либо долги по очереди (старые сначала).
r.post("/", can("payments_manage"), async (req, res, next) => {
  try {
    const { client_id, client_sub_id = null, cash_amount = 0, method = "наличные",
            use_points = 0, payer = "", note = "" } = req.body;
    if (!client_id) return res.status(400).json({ error: "Не указан клиент" });

    const result = await tx(async (c) => {
      const { rows: [client] } = await c.query("SELECT * FROM clients WHERE id=$1 FOR UPDATE", [client_id]);
      if (!client) throw Object.assign(new Error("Клиент не найден"), { status: 404 });

      const rate = Number((await c.query("SELECT value FROM settings WHERE key='points_to_currency'")).rows[0]?.value || "1") || 1;
      const money = Math.max(0, Number(cash_amount) || 0);
      const usePts = Math.max(0, Math.min(Number(use_points) || 0, client.bonus_points));
      const pointsValue = usePts * rate;
      const total = money + pointsValue;
      if (total <= 0) throw Object.assign(new Error("Сумма должна быть > 0"), { status: 400 });

      // распределяем на долги абонемента(ов)
      const targets = client_sub_id
        ? (await c.query("SELECT * FROM client_subscriptions WHERE id=$1", [client_sub_id])).rows
        : (await c.query("SELECT * FROM client_subscriptions WHERE client_id=$1 AND price>paid ORDER BY purchase_date", [client_id])).rows;
      let left = total;
      let branch = client.branch_id || null;
      for (const s of targets) {
        if (left <= 0) break;
        const owed = Number(s.price) - Number(s.paid);
        const pay = Math.min(owed, left);
        if (pay > 0) {
          await c.query("UPDATE client_subscriptions SET paid = paid + $1, status='active' WHERE id=$2", [pay, s.id]);
          left -= pay;
          if (s.branch_id) branch = s.branch_id;
        }
      }

      const created = [];
      if (money > 0) {
        const { rows: [p] } = await c.query(
          "INSERT INTO payments(client_id, client_sub_id, amount, method, status, note, payer, branch_id) VALUES($1,$2,$3,$4,'succeeded',$5,$6,$7) RETURNING *",
          [client_id, client_sub_id, money, method, note || "оплата", payer, branch]);
        created.push(p);
      }
      // бонусы — не доход
      if (usePts > 0) {
        await c.query("UPDATE clients SET bonus_points = bonus_points - $1 WHERE id=$2", [usePts, client_id]);
        await c.query("INSERT INTO loyalty_transactions(client_id, points, reason) VALUES($1,$2,$3)", [client_id, -usePts, note || "Оплата бонусами"]);
        const { rows: [p] } = await c.query(
          "INSERT INTO payments(client_id, client_sub_id, amount, method, status, note, payer, counts_revenue, branch_id) VALUES($1,$2,$3,'бонусы','succeeded',$4,$5,false,$6) RETURNING *",
          [client_id, client_sub_id, pointsValue, `Списано ${usePts} бонусов`, payer, branch]);
        created.push(p);
      }

      return { ok: true, payments: created, applied: total };
    });
    res.json(result);
    // Уведомления сотрудникам (web-push + Telegram) подключатся на этапе 5
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Редактирование оплаты. Корректирует paid у абонемента на дельту суммы.
r.patch("/:id", can("payments_manage"), async (req, res, next) => {
  try {
    const { amount, method, note, created_at, payer } = req.body;
    const result = await tx(async (c) => {
      const { rows: [p] } = await c.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!p) throw Object.assign(new Error("Оплата не найдена"), { status: 404 });
      const newAmount = amount != null ? Number(amount) : Number(p.amount);
      if (p.client_sub_id && p.status === "succeeded" && p.op_type === "payment") {
        const delta = newAmount - Number(p.amount);
        if (delta !== 0) await c.query("UPDATE client_subscriptions SET paid = GREATEST(0, paid + $1) WHERE id=$2", [delta, p.client_sub_id]);
      }
      const { rows: [u] } = await c.query(
        `UPDATE payments SET amount=$2, method=COALESCE($3,method), note=COALESCE($4,note),
           created_at=COALESCE($5::timestamptz, created_at), payer=COALESCE($6,payer)
         WHERE id=$1 RETURNING *`,
        [req.params.id, newAmount, method || null, note ?? null, created_at || null, payer ?? null]);
      return u;
    });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Возврат: создаёт операцию refund и уменьшает paid у абонемента
r.post("/:id/refund", can("payments_manage"), async (req, res, next) => {
  try {
    const result = await tx(async (c) => {
      const { rows: [p] } = await c.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!p) throw Object.assign(new Error("Оплата не найдена"), { status: 404 });
      const amount = req.body?.amount != null ? Number(req.body.amount) : Number(p.amount);
      if (p.client_sub_id) await c.query("UPDATE client_subscriptions SET paid = GREATEST(0, paid - $1) WHERE id=$2", [amount, p.client_sub_id]);
      const { rows: [ref] } = await c.query(
        `INSERT INTO payments(client_id, client_sub_id, amount, method, status, note, payer, op_type, branch_id)
         VALUES($1,$2,$3,$4,'succeeded',$5,$6,'refund',$7) RETURNING *`,
        [p.client_id, p.client_sub_id, amount, p.method, "Возврат: " + (p.note || ""), p.payer || "", p.branch_id]);
      return ref;
    });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Удаление оплаты. Откатывает paid у абонемента и возвращает списанные бонусы.
r.delete("/:id", can("payments_manage"), async (req, res, next) => {
  try {
    await tx(async (c) => {
      const { rows: [p] } = await c.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!p) throw Object.assign(new Error("Оплата не найдена"), { status: 404 });
      if (p.client_sub_id && p.status === "succeeded" && p.op_type === "payment") {
        await c.query("UPDATE client_subscriptions SET paid = GREATEST(0, paid - $1) WHERE id=$2", [Number(p.amount), p.client_sub_id]);
      }
      if (p.op_type === "payment" && p.method === "бонусы") {
        const rate = Number((await c.query("SELECT value FROM settings WHERE key='points_to_currency'")).rows[0]?.value || "1") || 1;
        const pts = Math.round(Number(p.amount) / rate);
        await c.query("UPDATE clients SET bonus_points = bonus_points + $1 WHERE id=$2", [pts, p.client_id]);
        await c.query("INSERT INTO loyalty_transactions(client_id, points, reason) VALUES($1,$2,'Отмена списания бонусов')", [p.client_id, pts]);
      }
      await c.query("DELETE FROM payments WHERE id=$1", [req.params.id]);
    });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

export default r;
