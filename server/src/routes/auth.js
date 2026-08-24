import { Router } from "express";
import { q } from "../db.js";
import { hash, verify, sign, employee, can } from "../auth.js";

const r = Router();

// Приводим телефон к единому виду: только цифры, ведущая 8 → 7 (для РФ).
function normPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  return d;
}

// Поиск клиента по телефону в любом формате хранения (+7…, 8…, с пробелами)
async function findClientByPhone(phone) {
  const n = normPhone(phone);
  if (!n) return null;
  const { rows } = await q(
    "SELECT * FROM clients WHERE regexp_replace(phone, '\\D', '', 'g') = $1 OR regexp_replace(phone, '\\D', '', 'g') = $2",
    [n, n[0] === "7" ? "8" + n.slice(1) : n]);
  return rows[0] || null;
}

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

r.post("/client/login", async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    const c = await findClientByPhone(phone);
    if (!c || !(await verify(password, c.password_hash)))
      return res.status(401).json({ error: "Неверный телефон или пароль" });
    res.json({ token: sign({ id: c.id, role: "client", name: c.name }), name: c.name });
  } catch (e) { next(e); }
});

// Проверка: можно ли зарегистрироваться по этому телефону.
// Регистрация доступна ТОЛЬКО тем, кто уже есть в базе клиентов и ещё не задал пароль.
r.post("/client/check", async (req, res, next) => {
  try {
    if (!normPhone(req.body?.phone)) return res.status(400).json({ error: "Укажите телефон" });
    const c = await findClientByPhone(req.body.phone);
    if (!c) return res.json({ found: false });                       // нет в базе — регистрация недоступна
    if (c.password_hash) return res.json({ found: true, has_password: true });
    const masked = c.name ? c.name.trim().split(/\s+/).map((w) => w[0] + "***").join(" ") : "";
    res.json({ found: true, has_password: false, name_hint: masked });
  } catch (e) { next(e); }
});

// Клиент сам задаёт себе пароль (первичная регистрация)
r.post("/client/register", async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    if (!normPhone(req.body?.phone) || password.length < 4) return res.status(400).json({ error: "Пароль не короче 4 символов" });
    const c = await findClientByPhone(req.body.phone);
    if (!c) return res.status(404).json({ error: "Этот номер не найден в базе школы. Обратитесь к администратору." });
    if (c.password_hash) return res.status(409).json({ error: "Пароль уже задан. Войдите или обратитесь к администратору для сброса." });
    await q("UPDATE clients SET password_hash=$1 WHERE id=$2", [await hash(password), c.id]);
    res.json({ token: sign({ id: c.id, role: "client", name: c.name }), name: c.name });
  } catch (e) { next(e); }
});

export default r;
