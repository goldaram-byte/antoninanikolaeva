import { Router } from "express";
import { q } from "../db.js";
import { employee, can, hash, verify } from "../auth.js";
import { PERMISSIONS, PRESET_ADMIN, PRESET_TRAINER } from "../permissions.js";

const r = Router();
r.use(employee);

// ===== Свой пароль — может сменить любой сотрудник =====
r.post("/me/password", async (req, res, next) => {
  try {
    const { current, password } = req.body;
    if (String(password || "").length < 8) return res.status(400).json({ error: "Новый пароль — не короче 8 символов" });
    const { rows: [me] } = await q("SELECT password_hash FROM admins WHERE id=$1", [req.user.id]);
    if (!me || !(await verify(current, me.password_hash)))
      return res.status(400).json({ error: "Текущий пароль указан неверно" });
    await q("UPDATE admins SET password_hash=$1 WHERE id=$2", [await hash(password), req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ===== Дальше — только с правом «Управление сотрудниками и ролями» =====
r.use(can("employees_manage"));

// Полный список прав — для галочек в интерфейсе
r.get("/permissions", (_req, res) => res.json(PERMISSIONS));

// --- Роли ---
r.get("/roles", async (_req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT r.*, (SELECT count(*)::int FROM admins a WHERE a.role_id = r.id) AS people
       FROM roles r ORDER BY r.is_protected DESC, r.name`);
    res.json(rows);
  } catch (e) { next(e); }
});

r.post("/roles", async (req, res, next) => {
  try {
    const { name, scope = "all", permissions = {}, preset } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ error: "Укажите название роли" });
    const perms = preset === "admin" ? PRESET_ADMIN : preset === "trainer" ? PRESET_TRAINER : permissions;
    const { rows: [row] } = await q(
      "INSERT INTO roles(name, scope, permissions) VALUES($1,$2,$3) RETURNING *",
      [name.trim(), scope === "own" ? "own" : "all", perms]);
    res.json(row);
  } catch (e) { next(e); }
});

r.put("/roles/:id", async (req, res, next) => {
  try {
    const { rows: [role] } = await q("SELECT * FROM roles WHERE id=$1", [req.params.id]);
    if (!role) return res.status(404).json({ error: "Роль не найдена" });
    if (role.is_protected) return res.status(400).json({ error: "Роль «Владелец» изменять нельзя — у неё всегда полные права" });
    const { name, scope, permissions } = req.body;
    const { rows: [row] } = await q(
      `UPDATE roles SET name=COALESCE($1,name), scope=COALESCE($2,scope),
         permissions=COALESCE($3::jsonb, permissions) WHERE id=$4 RETURNING *`,
      [name ?? null, scope ?? null, permissions ? JSON.stringify(permissions) : null, req.params.id]);
    res.json(row);
  } catch (e) { next(e); }
});

r.delete("/roles/:id", async (req, res, next) => {
  try {
    const { rows: [role] } = await q("SELECT * FROM roles WHERE id=$1", [req.params.id]);
    if (!role) return res.status(404).json({ error: "Роль не найдена" });
    if (role.is_protected) return res.status(400).json({ error: "Роль «Владелец» удалить нельзя" });
    const { rows: [{ count }] } = await q("SELECT count(*)::int FROM admins WHERE role_id=$1", [req.params.id]);
    if (count > 0) return res.status(400).json({ error: `Роль назначена сотрудникам (${count}). Сначала переведите их на другую роль.` });
    await q("DELETE FROM roles WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --- Сотрудники ---
r.get("/", async (_req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT a.id, a.email, a.name, a.created_at, a.role_id, a.trainer_id,
              r.name AS role_name, r.is_protected AS is_owner, r.scope,
              t.name AS trainer_name
       FROM admins a
       LEFT JOIN roles r ON r.id = a.role_id
       LEFT JOIN trainers t ON t.id = a.trainer_id
       ORDER BY a.created_at`);
    res.json(rows);
  } catch (e) { next(e); }
});

r.post("/", async (req, res, next) => {
  try {
    const { email, password, name, role_id, trainer_id } = req.body;
    if (!String(email || "").trim()) return res.status(400).json({ error: "Укажите email — это логин для входа" });
    if (String(password || "").length < 8) return res.status(400).json({ error: "Пароль — не короче 8 символов" });
    const { rows: [dup] } = await q("SELECT id FROM admins WHERE lower(email)=lower($1)", [email]);
    if (dup) return res.status(400).json({ error: "Сотрудник с таким email уже есть" });
    const { rows: [row] } = await q(
      `INSERT INTO admins(email, password_hash, name, role_id, trainer_id)
       VALUES($1,$2,$3,$4,$5) RETURNING id, email, name`,
      [email.trim(), await hash(password), name || "", role_id || null, trainer_id || null]);
    res.json(row);
  } catch (e) { next(e); }
});

// Сколько всего владельцев (нужно, чтобы не остаться без владельца)
async function ownersCount() {
  const { rows: [{ count }] } = await q(
    "SELECT count(*)::int FROM admins a JOIN roles r ON r.id=a.role_id WHERE r.is_protected");
  return count;
}

r.put("/:id", async (req, res, next) => {
  try {
    const { email, name, role_id, trainer_id } = req.body;
    const { rows: [cur] } = await q(
      `SELECT a.*, r.is_protected FROM admins a LEFT JOIN roles r ON r.id=a.role_id WHERE a.id=$1`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: "Сотрудник не найден" });
    // не даём снять последнего владельца
    if (cur.is_protected && role_id && role_id !== cur.role_id && (await ownersCount()) <= 1)
      return res.status(400).json({ error: "Это единственный владелец — сначала назначьте владельцем кого-то ещё" });
    if (email && email.toLowerCase() !== cur.email.toLowerCase()) {
      const { rows: [dup] } = await q("SELECT id FROM admins WHERE lower(email)=lower($1) AND id<>$2", [email, req.params.id]);
      if (dup) return res.status(400).json({ error: "Такой email уже занят" });
    }
    const { rows: [row] } = await q(
      `UPDATE admins SET email=COALESCE($1,email), name=COALESCE($2,name),
         role_id=$3, trainer_id=$4 WHERE id=$5 RETURNING id, email, name`,
      [email ?? null, name ?? null, role_id || null, trainer_id || null, req.params.id]);
    res.json(row);
  } catch (e) { next(e); }
});

r.post("/:id/password", async (req, res, next) => {
  try {
    const { password } = req.body;
    if (String(password || "").length < 8) return res.status(400).json({ error: "Пароль — не короче 8 символов" });
    const { rowCount } = await q("UPDATE admins SET password_hash=$1 WHERE id=$2", [await hash(password), req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Сотрудник не найден" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.delete("/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Себя удалить нельзя" });
    const { rows: [cur] } = await q(
      `SELECT a.id, r.is_protected FROM admins a LEFT JOIN roles r ON r.id=a.role_id WHERE a.id=$1`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: "Сотрудник не найден" });
    if (cur.is_protected && (await ownersCount()) <= 1)
      return res.status(400).json({ error: "Это единственный владелец — удалять нельзя" });
    await q("DELETE FROM admins WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
