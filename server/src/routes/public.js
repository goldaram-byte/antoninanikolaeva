// Публичные данные для сайта школы (без входа в систему).
// Отсюда расписание забирает виджет /raspisanie.html, который вставляют
// на Tilda. Никаких персональных данных здесь не отдаётся — только
// занятия, время, филиал, направление и имя тренера.
import { Router } from "express";
import { q } from "../db.js";

const r = Router();

// Разрешаем читать с любого сайта: виджет может стоять на другом домене
r.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=300");   // 5 минут — чтобы не дёргать базу на каждый показ
  next();
});

const setting = async (key, def) =>
  (await q("SELECT value FROM settings WHERE key=$1", [key])).rows[0]?.value ?? def;

r.get("/schedule", async (req, res, next) => {
  try {
    if ((await setting("public_schedule", "1")) !== "1")
      return res.status(403).json({ error: "Публичное расписание отключено в настройках школы" });

    const branchId = req.query.branch_id || null;
    const branches = (await q("SELECT id, name, address FROM branches ORDER BY sort, name")).rows;
    const sessions = (await q(
      `SELECT s.id, s.branch_id, s.day_of_week, s.start_time, s.end_time,
              COALESCE(NULLIF(s.title,''), d.name, 'Тренировка') AS title,
              d.name AS discipline_name, d.color AS discipline_color,
              t.name AS trainer_name, s.room
       FROM sessions s
       LEFT JOIN disciplines d ON d.id=s.discipline_id
       LEFT JOIN trainers t ON t.id=s.trainer_id
       WHERE ($1::uuid IS NULL OR s.branch_id=$1)
       ORDER BY s.day_of_week, s.start_time`, [branchId])).rows;

    res.json({
      club_name: await setting("club_name", "Школа каратэ"),
      branches, sessions,
      updated_at: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

export default r;
