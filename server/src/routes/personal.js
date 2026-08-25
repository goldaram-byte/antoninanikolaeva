import { Router } from "express";
import { q, tx } from "../db.js";
import { employee, can } from "../auth.js";
import { deductSub, returnSub } from "./attendance.js";

const r = Router();
r.use(employee);

// Персональные тренировки за дату (журнал записи)
r.get("/", can("schedule_view"), async (req, res, next) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: "Укажите дату" });
    const branchId = req.query.branch_id || null;
    const trainerId = req.query.trainer_id || null;
    const { rows } = await q(
      `SELECT p.*, c.name AS client_name, c.phone, t.name AS trainer_name, b.name AS branch_name
       FROM personal_bookings p
       LEFT JOIN clients c ON c.id=p.client_id
       LEFT JOIN trainers t ON t.id=p.trainer_id
       LEFT JOIN branches b ON b.id=p.branch_id
       WHERE p.date=$1::date
         AND ($2::uuid IS NULL OR p.branch_id=$2)
         AND ($3::uuid IS NULL OR p.trainer_id=$3)
       ORDER BY p.start_time`, [date, branchId, trainerId]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Записать на персональную тренировку
r.post("/", can("attendance_mark"), async (req, res, next) => {
  try {
    const { branch_id, trainer_id, client_id, date, start_time, end_time = "", note = "" } = req.body;
    if (!trainer_id || !client_id || !date || !start_time) return res.status(400).json({ error: "Укажите тренера, клиента, дату и время" });
    const { rows: [p] } = await q(
      "INSERT INTO personal_bookings(branch_id,trainer_id,client_id,date,start_time,end_time,note) VALUES($1,$2,$3,$4::date,$5,$6,$7) RETURNING *",
      [branch_id || null, trainer_id, client_id, date, start_time, end_time, note]);
    res.json(p);
  } catch (e) { next(e); }
});

// Смена статуса: attended списывает занятие с персонального абонемента, снятие — возвращает
r.patch("/:id", can("attendance_mark"), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["booked", "attended", "noshow", "cancelled"].includes(status)) return res.status(400).json({ error: "Неверный статус" });
    const result = await tx(async (c) => {
      const { rows: [p] } = await c.query("SELECT * FROM personal_bookings WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!p) throw Object.assign(new Error("Запись не найдена"), { status: 404 });

      let subId = p.client_sub_id;
      if (p.status === "attended" && status !== "attended") { await returnSub(c, p.client_sub_id); subId = null; }
      if (status === "attended" && p.status !== "attended") {
        const sub = await deductSub(c, p.client_id, p.date, "personal");
        subId = sub?.id || null;
      }
      const { rows: [u] } = await c.query(
        "UPDATE personal_bookings SET status=$2, client_sub_id=$3 WHERE id=$1 RETURNING *",
        [req.params.id, status, subId]);
      return u;
    });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

r.delete("/:id", can("attendance_mark"), async (req, res, next) => {
  try {
    await tx(async (c) => {
      const { rows: [p] } = await c.query("SELECT * FROM personal_bookings WHERE id=$1 FOR UPDATE", [req.params.id]);
      if (!p) return;
      if (p.status === "attended") await returnSub(c, p.client_sub_id);
      await c.query("DELETE FROM personal_bookings WHERE id=$1", [req.params.id]);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
