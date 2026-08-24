import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee, can("subs_manage"));

const setting = async (c, key, def) => {
  const { rows: [s] } = await c.query("SELECT value FROM settings WHERE key=$1", [key]);
  return s ? s.value : def;
};

// Цена тарифа для филиала: своя цена филиала, иначе базовая
async function priceFor(c, subType, branchId) {
  if (!branchId) return Number(subType.price);
  const { rows: [p] } = await c.query(
    "SELECT price FROM subscription_type_prices WHERE sub_type_id=$1 AND branch_id=$2", [subType.id, branchId]);
  return p ? Number(p.price) : Number(subType.price);
}

// Выдача абонемента клиенту.
// Цена: тариф (по филиалу) − персональная скидка − баллы, ЛИБО «своя цена»
// (сотрудник вводит сумму вручную; скидки к ней не применяются, баллы применимы).
// paidNow=false — выдача «в долг»: попадает в должники.
r.post("/", async (req, res, next) => {
  try {
    const { client_id, sub_type_id, paidNow = true, method = "наличные", trainer_id = null, use_points = 0,
            discount_percent, branch_id = null, start_date = null, expiry_date = null, custom_price = null, payer = "" } = req.body;
    const { rows: [t] } = await q("SELECT * FROM subscription_types WHERE id=$1", [sub_type_id]);
    if (!t) return res.status(404).json({ error: "Тариф не найден" });

    const result = await tx(async (c) => {
      const { rows: [client] } = await c.query("SELECT * FROM clients WHERE id=$1 FOR UPDATE", [client_id]);
      if (!client) throw Object.assign(new Error("Клиент не найден"), { status: 404 });

      const branch = branch_id || client.branch_id || null;
      const basePrice = await priceFor(c, t, branch);

      // 1) своя цена (например, до конца месяца) — скидки к ней не применяются
      const hasCustom = custom_price != null && custom_price !== "" && !Number.isNaN(Number(custom_price));
      const disc = hasCustom ? 0 : (discount_percent != null ? Number(discount_percent) : Number(client.discount_percent || 0));
      const afterDiscount = hasCustom
        ? Math.max(0, Math.round(Number(custom_price)))
        : Math.max(0, Math.round(basePrice * (1 - disc / 100)));

      // 2) оплата баллами
      const pointsToCur = Number(await setting(c, "points_to_currency", "1")) || 1;
      const maxByPrice = Math.floor(afterDiscount / pointsToCur);
      const usePts = Math.max(0, Math.min(Number(use_points) || 0, client.bonus_points, maxByPrice));
      const priceFinal = afterDiscount - usePts * pointsToCur;

      const { rows: [sub] } = await c.query(
        `INSERT INTO client_subscriptions (client_id, sub_type_id, name, kind, training_type, sessions_total, sessions_used,
                                           price, paid, purchase_date, expiry_date, branch_id, trainer_id)
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,
                 COALESCE($9::date, CURRENT_DATE),
                 COALESCE($10::date, COALESCE($9::date, CURRENT_DATE) + ($11 || ' days')::interval),
                 $12,$13) RETURNING *`,
        [client_id, t.id, t.name, t.kind, t.training_type || "group",
         t.kind === "unlimited" ? 0 : t.sessions, priceFinal, paidNow ? priceFinal : 0,
         start_date, expiry_date, String(t.days), branch, trainer_id]);

      if (usePts > 0) {
        await c.query("UPDATE clients SET bonus_points = bonus_points - $1 WHERE id=$2", [usePts, client_id]);
        await c.query("INSERT INTO loyalty_transactions(client_id, points, reason) VALUES($1,$2,$3)", [client_id, -usePts, `Оплата баллами: ${t.name}`]);
      }

      if (paidNow && priceFinal > 0) {
        await c.query(
          "INSERT INTO payments(client_id, client_sub_id, amount, method, status, note, payer, branch_id) VALUES($1,$2,$3,$4,'succeeded',$5,$6,$7)",
          [client_id, sub.id, priceFinal, method, t.name, payer, branch]);
        // кешбэк баллами (настройка loyalty_cashback_percent, начисления видны в истории)
        const cbPct = Number(await setting(c, "loyalty_cashback_percent", "0")) || 0;
        const cb = Math.floor(priceFinal * cbPct / 100);
        if (cb > 0) {
          await c.query("UPDATE clients SET bonus_points = bonus_points + $1 WHERE id=$2", [cb, client_id]);
          await c.query("INSERT INTO loyalty_transactions(client_id, points, reason) VALUES($1,$2,$3)", [client_id, cb, `Кешбэк с покупки: ${t.name}`]);
        }
      }

      // Реферальная награда при ПЕРВОЙ покупке друга (проценты — в настройках).
      const { rows: [{ cnt }] } = await c.query("SELECT count(*)::int AS cnt FROM client_subscriptions WHERE client_id=$1", [client_id]);
      if (cnt === 1 && client.referred_by && paidNow && priceFinal > 0) {
        const { rows: [ref] } = await c.query("SELECT * FROM referrals WHERE referred_id=$1 AND status='pending' FOR UPDATE", [client_id]);
        if (ref) {
          const refPct = Number(await setting(c, "referral_referrer_percent", "0")) || 0;
          const friendPct = Number(await setting(c, "referral_friend_percent", "0")) || 0;
          const refPts = Math.round(priceFinal * refPct / 100);
          const friendPts = Math.round(priceFinal * friendPct / 100);
          if (refPts > 0) {
            await c.query("UPDATE clients SET bonus_points = bonus_points + $1 WHERE id=$2", [refPts, ref.referrer_id]);
            await c.query("INSERT INTO loyalty_transactions(client_id, points, reason) VALUES($1,$2,$3)", [ref.referrer_id, refPts, `Награда за друга: ${client.name} (${refPct}%)`]);
          }
          if (friendPts > 0) {
            await c.query("UPDATE clients SET bonus_points = bonus_points + $1 WHERE id=$2", [friendPts, client_id]);
            await c.query("INSERT INTO loyalty_transactions(client_id, points, reason) VALUES($1,$2,$3)", [client_id, friendPts, "Бонус новичку по приглашению"]);
          }
          await c.query("UPDATE referrals SET status='rewarded', reward_points=$1, rewarded_at=now() WHERE id=$2", [refPts, ref.id]);
        }
      }

      return { ...sub, _priceFinal: priceFinal, _usedPoints: usePts, _discount: disc };
    });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Предрасчёт цены для окна выдачи (учитывает филиал, скидку и баллы)
r.get("/quote", async (req, res, next) => {
  try {
    const { client_id, sub_type_id, use_points = 0, branch_id = null } = req.query;
    const { rows: [t] } = await q("SELECT * FROM subscription_types WHERE id=$1", [sub_type_id]);
    const { rows: [client] } = await q("SELECT branch_id, discount_percent, bonus_points FROM clients WHERE id=$1", [client_id]);
    if (!t || !client) return res.status(404).json({ error: "Не найдено" });
    const branch = branch_id || client.branch_id || null;
    const base = await priceFor({ query: q }, t, branch);
    const pointsToCur = Number((await q("SELECT value FROM settings WHERE key='points_to_currency'")).rows[0]?.value || "1") || 1;
    const disc = Number(client.discount_percent || 0);
    const afterDiscount = Math.max(0, Math.round(base * (1 - disc / 100)));
    const maxByPrice = Math.floor(afterDiscount / pointsToCur);
    const usePts = Math.max(0, Math.min(Number(use_points) || 0, client.bonus_points, maxByPrice));
    res.json({ base, discount: disc, afterDiscount, pointsBalance: client.bonus_points, pointsToCur,
               maxPoints: Math.min(client.bonus_points, maxByPrice), usePts, final: afterDiscount - usePts * pointsToCur });
  } catch (e) { next(e); }
});

// Редактирование абонемента: срок, занятия, цена, филиал, тренер
r.patch("/:id", async (req, res, next) => {
  try {
    const { purchase_date, expiry_date, sessions_total, sessions_used, price, name, branch_id, trainer_id } = req.body;
    const { rows: [u] } = await q(
      `UPDATE client_subscriptions SET
         purchase_date  = COALESCE($2::date, purchase_date),
         expiry_date    = COALESCE($3::date, expiry_date),
         sessions_total = COALESCE($4::int, sessions_total),
         sessions_used  = COALESCE($5::int, sessions_used),
         price          = COALESCE($6::numeric, price),
         name           = COALESCE($7, name),
         branch_id      = COALESCE($8::uuid, branch_id),
         trainer_id     = COALESCE($9::uuid, trainer_id)
       WHERE id=$1 RETURNING *`,
      [req.params.id, purchase_date || null, expiry_date || null,
       sessions_total ?? null, sessions_used ?? null, price ?? null, name || null,
       branch_id || null, trainer_id || null]);
    if (!u) return res.status(404).json({ error: "Абонемент не найден" });
    res.json(u);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Удаление абонемента. Если по нему есть оплаты — требуем подтверждение (force).
r.delete("/:id", async (req, res, next) => {
  try {
    const force = req.query.force === "1" || req.body?.force === true;
    const { rows: [s] } = await q("SELECT * FROM client_subscriptions WHERE id=$1", [req.params.id]);
    if (!s) return res.status(404).json({ error: "Абонемент не найден" });
    const { rows: [{ cnt }] } = await q("SELECT count(*)::int AS cnt FROM payments WHERE client_sub_id=$1", [req.params.id]);
    if ((cnt > 0 || Number(s.paid) > 0 || Number(s.sessions_used) > 0) && !force) {
      return res.status(409).json({ error: "По абонементу есть оплаты или занятия. Удалить вместе с оплатами?", needsForce: true });
    }
    await tx(async (c) => {
      await c.query("DELETE FROM payments WHERE client_sub_id=$1", [req.params.id]);
      await c.query("DELETE FROM client_subscriptions WHERE id=$1", [req.params.id]);
    });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

export default r;
