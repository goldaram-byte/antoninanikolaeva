import { Router } from "express";
import { q } from "../db.js";
import { requireClient } from "../auth.js";

const r = Router();
r.use(requireClient);

// Личный кабинет: профиль клиента.
// На следующих этапах сюда добавятся абонементы, посещения, оплаты, бонусы.
r.get("/", async (req, res, next) => {
  try {
    const { rows: [c] } = await q(
      "SELECT id, name, phone, email, card_id FROM clients WHERE id=$1", [req.user.id]);
    if (!c) return res.status(404).json({ error: "Клиент не найден" });
    res.json(c);
  } catch (e) { next(e); }
});

export default r;
