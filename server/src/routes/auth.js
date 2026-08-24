import { Router } from "express";
import { q } from "../db.js";
import { hash, verify, sign, employee, can } from "../auth.js";

const r = Router();

// Создать сотрудника. Первый — свободно (станет владельцем), далее — только тот,
// у кого есть право employees_manage.
r.post("/admin/register", async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email и password обязательны" });
    const { rows: [{ count }] } = await q("SELECT count(*)::int FROM admins");
    const create = async () => {
      const h = await hash(password);
      // первый сотрудник получает роль «Владелец», если она есть
      const { rows: [owner] } = await q("SELECT id FROM roles WHERE is_protected=true LIMIT 1");
      const { rows: [a] } = await q(
        "INSERT INTO admins(email,password_hash,name,role_id) VALUES($1,$2,$3,$4) RETURNING id,email,name",
        [email, h, name || "", count === 0 ? (owner?.id || null) : null]);
      res.json(a);
    };
    if (count > 0) return employee(req, res, () => can("employees_manage")(req, res, create));
    await create();
  } catch (e) { next(e); }
});

r.post("/admin/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows: [a] } = await q(
      `SELECT a.*, r.scope, r.permissions, r.name AS role_name, r.is_protected
       FROM admins a LEFT JOIN roles r ON r.id=a.role_id WHERE a.email=$1`, [email]);
    if (!a || !(await verify(password, a.password_hash)))
      return res.status(401).json({ error: "Неверный email или пароль" });
    res.json({
      token: sign({ id: a.id, role: "employee", name: a.name }),
      name: a.name,
      roleName: a.role_name || "Сотрудник",
      scope: a.is_protected ? "all" : (a.scope || "all"),
      perms: a.is_protected ? { __all: true } : (a.permissions || {}),
      isOwner: !!a.is_protected,
    });
  } catch (e) { next(e); }
});

export default r;
