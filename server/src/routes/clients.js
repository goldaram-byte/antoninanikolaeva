import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee);

const ownTrainer = (req) => (req.user.scope === "own" ? req.user.trainerId : null);
const refCode = () => "REF" + Math.random().toString(36).slice(2, 8).toUpperCase();

async function setLinks(c, clientId, disciplineIds = [], trainerIds = []) {
  await c.query("DELETE FROM client_disciplines WHERE client_id=$1", [clientId]);
  for (const id of disciplineIds) if (id) await c.query("INSERT INTO client_disciplines(client_id,discipline_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [clientId, id]);
  await c.query("DELETE FROM client_trainers WHERE client_id=$1", [clientId]);
  for (const id of trainerIds) if (id) await c.query("INSERT INTO client_trainers(client_id,trainer_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [clientId, id]);
}

r.get("/", can("clients_view"), async (req, res, next) => {
  try {
    const search = `%${(req.query.search || "").toLowerCase()}%`;
    const branchId = req.query.branch_id || null;
    const trainerId = req.query.trainer_id || null;
    const own = ownTrainer(req);
    const { rows } = await q(`
      SELECT c.*, b.name AS branch_name,
        COALESCE((SELECT sum(price - paid) FROM client_subscriptions s WHERE s.client_id=c.id AND price>paid AND s.status='active'),0) AS debt,
        COALESCE((SELECT json_agg(jsonb_build_object('id',d.id,'name',d.name,'color',d.color))
                  FROM client_disciplines cd JOIN disciplines d ON d.id=cd.discipline_id WHERE cd.client_id=c.id),'[]') AS disciplines,
        COALESCE((SELECT json_agg(jsonb_build_object('id',t.id,'name',t.name))
                  FROM client_trainers ct JOIN trainers t ON t.id=ct.trainer_id WHERE ct.client_id=c.id),'[]') AS trainers
      FROM clients c
      LEFT JOIN branches b ON b.id=c.branch_id
      WHERE (lower(c.name) LIKE $1 OR coalesce(c.phone,'') LIKE $1)
        AND ($2::uuid IS NULL OR c.branch_id = $2)
        AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM client_trainers x WHERE x.client_id=c.id AND x.trainer_id=$3))
        AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM client_trainers x WHERE x.client_id=c.id AND x.trainer_id=$4))
      ORDER BY c.name`, [search, branchId, trainerId, own]);
    res.json(rows);
  } catch (e) { next(e); }
});

r.get("/:id", can("clients_view"), async (req, res, next) => {
  try {
    const own = ownTrainer(req);
    const { rows: [c] } = await q(
      "SELECT c.*, b.name AS branch_name FROM clients c LEFT JOIN branches b ON b.id=c.branch_id WHERE c.id=$1", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Клиент не найден" });
    if (own) {
      const { rows: [{ cnt }] } = await q("SELECT count(*)::int AS cnt FROM client_trainers WHERE client_id=$1 AND trainer_id=$2", [c.id, own]);
      if (cnt === 0) return res.status(403).json({ error: "Это не ваш клиент" });
    }
    const subs = (await q(
      `SELECT s.*, b.name AS branch_name, t.name AS trainer_name
       FROM client_subscriptions s LEFT JOIN branches b ON b.id=s.branch_id LEFT JOIN trainers t ON t.id=s.trainer_id
       WHERE s.client_id=$1 ORDER BY s.purchase_date DESC`, [c.id])).rows;
    const payments = (await q("SELECT * FROM payments WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100", [c.id])).rows;
    const disciplines = (await q("SELECT d.* FROM client_disciplines cd JOIN disciplines d ON d.id=cd.discipline_id WHERE cd.client_id=$1", [c.id])).rows;
    const trainers = (await q("SELECT t.* FROM client_trainers ct JOIN trainers t ON t.id=ct.trainer_id WHERE ct.client_id=$1", [c.id])).rows;
    const loyalty = (await q("SELECT points, reason, created_at FROM loyalty_transactions WHERE client_id=$1 ORDER BY created_at DESC LIMIT 20", [c.id])).rows;
    const referredByName = c.referred_by ? (await q("SELECT name FROM clients WHERE id=$1", [c.referred_by])).rows[0]?.name : null;
    // История посещений появится на этапе 3 (таблица bookings) — пока пустой список
    res.json({ ...c, subs, payments, disciplines, trainers, loyalty, referredByName, visits: [] });
  } catch (e) { next(e); }
});

r.post("/", can("clients_edit"), async (req, res, next) => {
  try {
    const { name, phone, email, birthdate, notes, branch_id, discipline_ids, trainer_ids, discount_percent, referral_code } = req.body;
    if (!name) return res.status(400).json({ error: "Имя обязательно" });
    const c = await tx(async (cl) => {
      // пригласивший — по реферальному коду (награды начнут начисляться на этапе лояльности)
      let referrerId = null;
      if (referral_code) {
        const { rows: [ref] } = await cl.query("SELECT id FROM clients WHERE referral_code=$1", [String(referral_code).trim().toUpperCase()]);
        referrerId = ref?.id || null;
      }
      const { rows: [row] } = await cl.query(
        `INSERT INTO clients(name,phone,email,birthdate,notes,branch_id,discount_percent,referral_code,referred_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [name, phone || null, email || null, birthdate || null, notes || "",
         branch_id || null, discount_percent || 0, refCode(), referrerId]);
      await setLinks(cl, row.id, discipline_ids, trainer_ids);
      if (referrerId) await cl.query("INSERT INTO referrals(referrer_id, referred_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [referrerId, row.id]);
      return row;
    });
    res.json(c);
  } catch (e) { next(e); }
});

r.put("/:id", can("clients_edit"), async (req, res, next) => {
  try {
    const { name, phone, email, birthdate, notes, branch_id, discipline_ids, trainer_ids, discount_percent } = req.body;
    const c = await tx(async (cl) => {
      const { rows: [row] } = await cl.query(
        `UPDATE clients SET name=$1, phone=$2, email=$3, birthdate=$4, notes=$5,
           branch_id=$6, discount_percent=COALESCE($7,discount_percent)
         WHERE id=$8 RETURNING *`,
        [name, phone || null, email || null, birthdate || null, notes || "",
         branch_id || null, discount_percent ?? null, req.params.id]);
      if (!row) return null;
      await setLinks(cl, row.id, discipline_ids, trainer_ids);
      return row;
    });
    if (!c) return res.status(404).json({ error: "Клиент не найден" });
    res.json(c);
  } catch (e) { next(e); }
});

r.delete("/:id", can("clients_edit"), async (req, res, next) => {
  try { await q("DELETE FROM clients WHERE id=$1", [req.params.id]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

export default r;
