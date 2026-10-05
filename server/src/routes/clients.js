import { Router } from "express";
import ExcelJS from "exceljs";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee);

const ownTrainer = (req) => (req.user.scope === "own" ? req.user.trainerId : null);
const refCode = () => "REF" + Math.random().toString(36).slice(2, 8).toUpperCase();

// Тренер клиента определяется группами расписания (client_trainers_all),
// вручную привязываются только направления.
async function setLinks(c, clientId, disciplineIds = []) {
  await c.query("DELETE FROM client_disciplines WHERE client_id=$1", [clientId]);
  for (const id of disciplineIds) if (id) await c.query("INSERT INTO client_disciplines(client_id,discipline_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [clientId, id]);
}

// Выборка клиентов по фильтрам списка (используется и списком, и экспортом)
async function listClients(req) {
    const search = `%${(req.query.search || "").toLowerCase()}%`;
    const branchId = req.query.branch_id || null;
    const trainerId = req.query.trainer_id || null;
    const managerId = req.query.manager_id || null;
    const status = req.query.status || null;          // active | inactive | null (все)
    const own = ownTrainer(req);
    const { rows } = await q(`
      SELECT c.*, b.name AS branch_name,
        COALESCE(NULLIF(m.name,''), m.email) AS manager_name,
        COALESCE((SELECT sum(price - paid) FROM client_subscriptions s WHERE s.client_id=c.id AND price>paid AND s.status='active'),0) AS debt,
        COALESCE((SELECT json_agg(jsonb_build_object('id',d.id,'name',d.name,'color',d.color))
                  FROM client_disciplines cd JOIN disciplines d ON d.id=cd.discipline_id WHERE cd.client_id=c.id),'[]') AS disciplines,
        COALESCE((SELECT json_agg(DISTINCT jsonb_build_object('id',t.id,'name',t.name))
                  FROM client_trainers_all ct JOIN trainers t ON t.id=ct.trainer_id WHERE ct.client_id=c.id),'[]') AS trainers
      FROM clients c
      LEFT JOIN branches b ON b.id=c.branch_id
      LEFT JOIN admins m ON m.id=c.manager_id
      WHERE (lower(c.name) LIKE $1 OR coalesce(c.phone,'') LIKE $1
             OR coalesce(c.parent_phone,'') LIKE $1 OR lower(coalesce(c.parent_name,'')) LIKE $1)
        AND ($2::uuid IS NULL OR c.branch_id = $2)
        AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM client_trainers_all x WHERE x.client_id=c.id AND x.trainer_id=$3))
        AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM client_trainers_all x WHERE x.client_id=c.id AND x.trainer_id=$4))
        AND ($5::uuid IS NULL OR c.manager_id = $5)
        AND ($6::text IS NULL OR c.status = $6)
      ORDER BY c.name`, [search, branchId, trainerId, own, managerId, status]);
    return rows;
}

r.get("/", can("clients_view"), async (req, res, next) => {
  try { res.json(await listClients(req)); } catch (e) { next(e); }
});

// Экспорт базы клиентов в Excel — по тем же фильтрам, что и список.
// Сумма долга попадает в файл только тем, кому можно видеть финансы.
r.get("/export.xlsx", can("clients_view"), async (req, res, next) => {
  try {
    const rows = await listClients(req);
    const perms = req.user?.perms || {};
    const canFinance = !!(perms.__all || perms.finance_view);
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) : "");
    const GENDER = { m: "муж", f: "жен" };

    const wb = new ExcelJS.Workbook();
    wb.creator = "CRM «Школа каратэ»";
    const ws = wb.addWorksheet("Клиенты", { views: [{ state: "frozen", ySplit: 1 }] });
    const cols = [
      { header: "Имя", key: "name", width: 28 },
      { header: "Телефон", key: "phone", width: 16 },
      { header: "Статус", key: "status", width: 12 },
      { header: "Филиал", key: "branch", width: 18 },
      { header: "Тренеры", key: "trainers", width: 22 },
      { header: "Направления", key: "disciplines", width: 18 },
      { header: "Ответственный", key: "manager", width: 18 },
      { header: "Дата рождения", key: "birthdate", width: 14 },
      { header: "Пол", key: "gender", width: 6 },
      { header: "Родитель", key: "parent_name", width: 20 },
      { header: "Телефон родителя", key: "parent_phone", width: 18 },
      { header: "Email", key: "email", width: 22 },
      { header: "Источник", key: "source", width: 16 },
      { header: "Скидка, %", key: "discount", width: 10 },
      { header: "Баллы", key: "points", width: 8 },
      ...(canFinance ? [{ header: "Долг, ₽", key: "debt", width: 10 }] : []),
      { header: "Реферальный код", key: "ref", width: 16 },
      { header: "В базе с", key: "created", width: 12 },
      { header: "ID прежней CRM", key: "external_id", width: 14 },
      { header: "Заметки", key: "notes", width: 40 },
    ];
    ws.columns = cols;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F3" } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

    for (const c of rows) {
      ws.addRow({
        name: c.name, phone: c.phone || "", status: c.status === "inactive" ? "неактивный" : "активный",
        branch: c.branch_name || "", trainers: (c.trainers || []).map((t) => t.name).join(", "),
        disciplines: (c.disciplines || []).map((d) => d.name).join(", "),
        manager: c.manager_name || "", birthdate: fmtDate(c.birthdate), gender: GENDER[c.gender] || "",
        parent_name: c.parent_name || "", parent_phone: c.parent_phone || "", email: c.email || "",
        source: c.source || "", discount: Number(c.discount_percent) || 0, points: c.bonus_points || 0,
        ...(canFinance ? { debt: Number(c.debt) || 0 } : {}),
        ref: c.referral_code || "", created: fmtDate(c.created_at), external_id: c.external_id || "",
        notes: c.notes || "",
      });
    }

    const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="clients_${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent("Клиенты_" + stamp + ".xlsx")}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

r.get("/:id", can("clients_view"), async (req, res, next) => {
  try {
    const own = ownTrainer(req);
    const { rows: [c] } = await q(
      `SELECT c.*, b.name AS branch_name, COALESCE(NULLIF(m.name,''), m.email) AS manager_name
       FROM clients c LEFT JOIN branches b ON b.id=c.branch_id LEFT JOIN admins m ON m.id=c.manager_id
       WHERE c.id=$1`, [req.params.id]);
    if (!c) return res.status(404).json({ error: "Клиент не найден" });
    if (own) {
      const { rows: [{ cnt }] } = await q("SELECT count(*)::int AS cnt FROM client_trainers_all WHERE client_id=$1 AND trainer_id=$2", [c.id, own]);
      if (cnt === 0) return res.status(403).json({ error: "Это не ваш клиент" });
    }
    const subs = (await q(
      `SELECT s.*, b.name AS branch_name, t.name AS trainer_name
       FROM client_subscriptions s LEFT JOIN branches b ON b.id=s.branch_id LEFT JOIN trainers t ON t.id=s.trainer_id
       WHERE s.client_id=$1 ORDER BY s.purchase_date DESC`, [c.id])).rows;
    const payments = (await q("SELECT * FROM payments WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100", [c.id])).rows;
    const disciplines = (await q("SELECT d.* FROM client_disciplines cd JOIN disciplines d ON d.id=cd.discipline_id WHERE cd.client_id=$1", [c.id])).rows;
    // тренеры — из групп расписания, в которые записан клиент
    const trainers = (await q(
      `SELECT DISTINCT t.* FROM client_trainers_all ct JOIN trainers t ON t.id=ct.trainer_id
       WHERE ct.client_id=$1 ORDER BY t.name`, [c.id])).rows;
    const loyalty = (await q("SELECT points, reason, created_at FROM loyalty_transactions WHERE client_id=$1 ORDER BY created_at DESC LIMIT 20", [c.id])).rows;
    const referredByName = c.referred_by ? (await q("SELECT name FROM clients WHERE id=$1", [c.referred_by])).rows[0]?.name : null;
    // Группы, за которыми закреплён клиент
    const groups = (await q(
      `SELECT s.id, s.title, s.day_of_week, s.start_time, s.end_time,
              d.name AS discipline_name, t.name AS trainer_name, b.name AS branch_name
       FROM client_sessions cs JOIN sessions s ON s.id=cs.session_id
       LEFT JOIN disciplines d ON d.id=s.discipline_id
       LEFT JOIN trainers t ON t.id=s.trainer_id
       LEFT JOIN branches b ON b.id=s.branch_id
       WHERE cs.client_id=$1 ORDER BY s.day_of_week, s.start_time`, [c.id])).rows;
    // История посещений: групповые + персональные, свежие сверху
    const visits = (await q(
      `SELECT b.date, b.status, b.no_sub, COALESCE(NULLIF(s.title,''), d.name, 'Занятие') AS title,
              s.start_time, 'group' AS kind, t.name AS trainer_name
       FROM bookings b JOIN sessions s ON s.id=b.session_id
       LEFT JOIN disciplines d ON d.id=s.discipline_id
       LEFT JOIN trainers t ON t.id=s.trainer_id
       WHERE b.client_id=$1
       UNION ALL
       SELECT p.date, p.status, false AS no_sub, 'Персональная тренировка' AS title,
              p.start_time, 'personal' AS kind, t.name AS trainer_name
       FROM personal_bookings p LEFT JOIN trainers t ON t.id=p.trainer_id
       WHERE p.client_id=$1
       ORDER BY date DESC, start_time DESC LIMIT 60`, [c.id])).rows;
    res.json({ ...c, subs, payments, disciplines, trainers, loyalty, referredByName, groups, visits });
  } catch (e) { next(e); }
});

r.post("/", can("clients_edit"), async (req, res, next) => {
  try {
    const { name, phone, email, birthdate, notes, branch_id, discipline_ids, discount_percent, referral_code,
            gender, parent_name, parent_phone, source, manager_id, status } = req.body;
    if (!name) return res.status(400).json({ error: "Имя обязательно" });
    const c = await tx(async (cl) => {
      // пригласивший — по реферальному коду (награды начнут начисляться на этапе лояльности)
      let referrerId = null;
      if (referral_code) {
        const { rows: [ref] } = await cl.query("SELECT id FROM clients WHERE referral_code=$1", [String(referral_code).trim().toUpperCase()]);
        referrerId = ref?.id || null;
      }
      const { rows: [row] } = await cl.query(
        `INSERT INTO clients(name,phone,email,birthdate,notes,branch_id,discount_percent,referral_code,referred_by,
                             gender,parent_name,parent_phone,source,manager_id,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [name, phone || null, email || null, birthdate || null, notes || "",
         branch_id || null, discount_percent || 0, refCode(), referrerId,
         gender || null, parent_name || null, parent_phone || null, source || null,
         manager_id || null, status === "inactive" ? "inactive" : "active"]);
      await setLinks(cl, row.id, discipline_ids);
      if (referrerId) await cl.query("INSERT INTO referrals(referrer_id, referred_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [referrerId, row.id]);
      return row;
    });
    res.json(c);
  } catch (e) { next(e); }
});

r.put("/:id", can("clients_edit"), async (req, res, next) => {
  try {
    const { name, phone, email, birthdate, notes, branch_id, discipline_ids, discount_percent,
            gender, parent_name, parent_phone, source, manager_id, status } = req.body;
    const c = await tx(async (cl) => {
      const { rows: [row] } = await cl.query(
        `UPDATE clients SET name=$1, phone=$2, email=$3, birthdate=$4, notes=$5,
           branch_id=$6, discount_percent=COALESCE($7,discount_percent),
           gender=$8, parent_name=$9, parent_phone=$10, source=$11,
           manager_id=$12, status=COALESCE($13, status)
         WHERE id=$14 RETURNING *`,
        [name, phone || null, email || null, birthdate || null, notes || "",
         branch_id || null, discount_percent ?? null,
         gender || null, parent_name || null, parent_phone || null, source || null,
         manager_id || null, status ? (status === "inactive" ? "inactive" : "active") : null, req.params.id]);
      if (!row) return null;
      await setLinks(cl, row.id, discipline_ids);
      return row;
    });
    if (!c) return res.status(404).json({ error: "Клиент не найден" });
    res.json(c);
  } catch (e) { next(e); }
});

// Массовые действия над выбранными клиентами: прикрепить/открепить
// направление или группу расписания (тренер следует за группой),
// перевести в активные/неактивные.
r.post("/bulk", can("clients_edit"), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    const action = String(req.body?.action || "");
    if (ids.length === 0) return res.status(400).json({ error: "Не выбран ни один клиент" });

    // тренеру с режимом «только свои» — только его клиенты
    const own = ownTrainer(req);
    const { rows } = await q(
      `SELECT c.id FROM clients c
        WHERE c.id = ANY($1::uuid[])
          AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM client_trainers_all x WHERE x.client_id=c.id AND x.trainer_id=$2))`,
      [ids, own]);
    const allowed = rows.map((x) => x.id);
    if (allowed.length === 0) return res.status(403).json({ error: "Нет доступа к выбранным клиентам" });

    const disciplineId = req.body?.discipline_id || null;
    const sessionId = req.body?.session_id || null;

    await tx(async (c) => {
      switch (action) {
        case "discipline_add":
          if (!disciplineId) throw Object.assign(new Error("Не выбрано направление"), { status: 400 });
          await c.query(
            `INSERT INTO client_disciplines(client_id, discipline_id)
             SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING`, [allowed, disciplineId]);
          break;
        case "discipline_remove":
          if (!disciplineId) throw Object.assign(new Error("Не выбрано направление"), { status: 400 });
          await c.query("DELETE FROM client_disciplines WHERE client_id = ANY($1::uuid[]) AND discipline_id=$2", [allowed, disciplineId]);
          break;
        case "session_add":
          if (!sessionId) throw Object.assign(new Error("Не выбрана группа расписания"), { status: 400 });
          await c.query(
            `INSERT INTO client_sessions(client_id, session_id)
             SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING`, [allowed, sessionId]);
          break;
        case "session_remove":
          if (!sessionId) throw Object.assign(new Error("Не выбрана группа расписания"), { status: 400 });
          await c.query("DELETE FROM client_sessions WHERE client_id = ANY($1::uuid[]) AND session_id=$2", [allowed, sessionId]);
          break;
        case "status_active":
        case "status_inactive":
          await c.query("UPDATE clients SET status=$2 WHERE id = ANY($1::uuid[])",
            [allowed, action === "status_active" ? "active" : "inactive"]);
          break;
        default:
          throw Object.assign(new Error("Неизвестное действие"), { status: 400 });
      }
    });
    res.json({ ok: true, affected: allowed.length, skipped: ids.length - allowed.length });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// Быстрое переключение статуса из карточки (без открытия формы)
r.put("/:id/status", can("clients_edit"), async (req, res, next) => {
  try {
    const status = req.body?.status === "inactive" ? "inactive" : "active";
    const { rows: [row] } = await q("UPDATE clients SET status=$1 WHERE id=$2 RETURNING id, status", [status, req.params.id]);
    if (!row) return res.status(404).json({ error: "Клиент не найден" });
    res.json(row);
  } catch (e) { next(e); }
});

r.delete("/:id", can("clients_edit"), async (req, res, next) => {
  try { await q("DELETE FROM clients WHERE id=$1", [req.params.id]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// Привязка клиента к группам расписания (задать весь список)
r.put("/:id/sessions", can("clients_edit"), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.session_ids) ? req.body.session_ids : [];
    await tx(async (c) => {
      await c.query("DELETE FROM client_sessions WHERE client_id=$1", [req.params.id]);
      for (const sid of ids) if (sid) await c.query("INSERT INTO client_sessions(client_id,session_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [req.params.id, sid]);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
