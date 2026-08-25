import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";

const r = Router();
r.use(employee);

// Списать занятие с подходящего абонемента: действующий по сроку, с остатком,
// нужного типа тренировок; сначала «по занятиям» (с ближайшим сроком), безлимит — не списывается.
export async function deductSub(c, clientId, date, trainingType) {
  const { rows } = await c.query(
    `SELECT * FROM client_subscriptions
     WHERE client_id=$1 AND status='active' AND training_type=$3
       AND purchase_date <= $2::date AND expiry_date >= $2::date
       AND (kind='unlimited' OR sessions_used < sessions_total)
     ORDER BY (kind='unlimited')::int, expiry_date
     LIMIT 1`, [clientId, date, trainingType]);
  const sub = rows[0];
  if (!sub) return null;
  if (sub.kind !== "unlimited")
    await c.query("UPDATE client_subscriptions SET sessions_used = sessions_used + 1 WHERE id=$1", [sub.id]);
  return sub;
}

// Вернуть списанное занятие (при снятии отметки «был»)
export async function returnSub(c, subId) {
  if (!subId) return;
  await c.query(
    "UPDATE client_subscriptions SET sessions_used = GREATEST(0, sessions_used - 1) WHERE id=$1 AND kind <> 'unlimited'", [subId]);
}

// Занятия дня с составом: закреплённые в группе + записавшиеся на дату.
// Учитываются разовые изменения (отмена/перенос).
r.get("/", can("attendance_view"), async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: "Укажите дату" });
    const branchId = req.query.branch_id || null;
    const dow = (new Date(date + "T00:00:00").getDay() + 6) % 7;   // 0=Пн

    const sessions = (await q(
      `SELECT s.*, d.name AS discipline_name, d.color AS discipline_color,
              t.name AS trainer_name, b.name AS branch_name,
              e.id AS exc_id, e.kind AS exc_kind, e.new_start, e.new_end, e.note AS exc_note
       FROM sessions s
       LEFT JOIN disciplines d ON d.id=s.discipline_id
       LEFT JOIN trainers t ON t.id=s.trainer_id
       LEFT JOIN branches b ON b.id=s.branch_id
       LEFT JOIN session_exceptions e ON e.session_id=s.id AND e.date=$1::date
       WHERE s.day_of_week=$2 AND ($3::uuid IS NULL OR s.branch_id=$3)
       ORDER BY COALESCE(e.new_start, s.start_time)`, [date, dow, branchId])).rows;

    for (const s of sessions) {
      // закреплённые в группе
      const fixed = (await q(
        `SELECT c.id, c.name, c.phone FROM client_sessions cs JOIN clients c ON c.id=cs.client_id
         WHERE cs.session_id=$1 ORDER BY c.name`, [s.id])).rows;
      // записавшиеся/отмеченные на эту дату
      const booked = (await q(
        `SELECT b.id AS booking_id, b.status, b.no_sub, b.client_sub_id, c.id, c.name, c.phone
         FROM bookings b JOIN clients c ON c.id=b.client_id
         WHERE b.session_id=$1 AND b.date=$2::date`, [s.id, date])).rows;
      const byId = new Map();
      for (const f of fixed) byId.set(f.id, { ...f, fixed: true, status: null });
      for (const b of booked) {
        const ex = byId.get(b.id);
        if (ex) Object.assign(ex, { status: b.status, no_sub: b.no_sub, booking_id: b.booking_id });
        else byId.set(b.id, { ...b, fixed: false });
      }
      s.roster = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
    res.json(sessions);
  } catch (e) { next(e); }
});

// Отметка посещаемости (тренер или администратор — право attendance_mark).
// status: attended | noshow | booked (booked = снять отметку)
r.post("/mark", can("attendance_mark"), async (req, res, next) => {
  try {
    const { session_id, date, client_id, status } = req.body;
    if (!session_id || !date || !client_id || !status) return res.status(400).json({ error: "Не хватает данных" });
    const result = await tx(async (c) => {
      const { rows: [ex] } = await c.query(
        "SELECT * FROM bookings WHERE client_id=$1 AND session_id=$2 AND date=$3::date FOR UPDATE", [client_id, session_id, date]);

      // снять «был» → вернуть занятие
      if (ex && ex.status === "attended" && status !== "attended") await returnSub(c, ex.client_sub_id);

      let subId = ex?.client_sub_id || null, noSub = false;
      if (status === "attended" && ex?.status !== "attended") {
        const sub = await deductSub(c, client_id, date, "group");
        subId = sub?.id || null;
        noSub = !sub;                      // был, но абонемента нет — долг (видно в журнале)
      }
      if (status !== "attended") { subId = null; noSub = false; }

      const { rows: [row] } = await c.query(
        `INSERT INTO bookings(client_id, session_id, date, status, client_sub_id, no_sub, marked_by)
         VALUES($1,$2,$3::date,$4,$5,$6,$7)
         ON CONFLICT (client_id, session_id, date)
         DO UPDATE SET status=$4, client_sub_id=$5, no_sub=$6, marked_by=$7
         RETURNING *`,
        [client_id, session_id, date, status, subId, noSub, req.user.name || ""]);
      return row;
    });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Разовая запись клиента на групповое занятие на дату (журнал записи)
r.post("/book", can("attendance_mark"), async (req, res, next) => {
  try {
    const { session_id, date, client_id } = req.body;
    const { rows: [b] } = await q(
      `INSERT INTO bookings(client_id, session_id, date, status, marked_by) VALUES($1,$2,$3::date,'booked',$4)
       ON CONFLICT (client_id, session_id, date) DO UPDATE SET status='booked'
       RETURNING *`, [client_id, session_id, date, req.user.name || ""]);
    res.json(b);
  } catch (e) { next(e); }
});

// Убрать запись (если занятие уже было отмечено «был» — вернуть занятие)
r.delete("/bookings/:id", can("attendance_mark"), async (req, res, next) => {
  try {
    await tx(async (c) => {
      const { rows: [b] } = await c.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!b) return;
      if (b.status === "attended") await returnSub(c, b.client_sub_id);
      await c.query("DELETE FROM bookings WHERE id=$1", [req.params.id]);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Записи на групповые занятия за дату (для журнала записи)
r.get("/bookings", can("attendance_view"), async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: "Укажите дату" });
    const branchId = req.query.branch_id || null;
    const { rows } = await q(
      `SELECT b.id AS booking_id, b.status, b.no_sub, b.date, c.id AS client_id, c.name AS client_name, c.phone,
              s.id AS session_id, s.title, s.start_time, s.end_time, br.name AS branch_name,
              d.name AS discipline_name, t.name AS trainer_name
       FROM bookings b
       JOIN clients c ON c.id=b.client_id
       JOIN sessions s ON s.id=b.session_id
       LEFT JOIN branches br ON br.id=s.branch_id
       LEFT JOIN disciplines d ON d.id=s.discipline_id
       LEFT JOIN trainers t ON t.id=s.trainer_id
       WHERE b.date=$1::date AND ($2::uuid IS NULL OR s.branch_id=$2)
       ORDER BY s.start_time, c.name`, [date, branchId]);
    res.json(rows);
  } catch (e) { next(e); }
});

export default r;
