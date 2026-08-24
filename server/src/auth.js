import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { q } from "./db.js";

const SECRET = process.env.JWT_SECRET || "dev-secret";

export const hash = (pwd) => bcrypt.hash(pwd, 10);
export const verify = (pwd, h) => (h ? bcrypt.compare(pwd, h) : Promise.resolve(false));
export const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: "30d" });

function readToken(req) {
  const h = req.headers.authorization || "";
  const [type, token] = h.split(" ");
  if (type !== "Bearer" || !token) return null;
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

// Загружает сотрудника, его роль и права из БД (изменение прав действует сразу).
export async function employee(req, res, next) {
  const u = readToken(req);
  if (!u || u.role !== "employee") return res.status(401).json({ error: "Нужен вход сотрудника" });
  const { rows: [e] } = await q(
    `SELECT a.id, a.name, a.trainer_id, r.scope, r.permissions, r.name AS role_name, r.is_protected
     FROM admins a LEFT JOIN roles r ON r.id = a.role_id WHERE a.id = $1`, [u.id]);
  if (!e) return res.status(401).json({ error: "Сотрудник не найден" });
  req.user = {
    id: e.id, name: e.name, trainerId: e.trainer_id,
    scope: e.is_protected ? "all" : (e.scope || "all"),
    perms: e.is_protected ? { __all: true } : (e.permissions || {}),
    roleName: e.role_name, isOwner: e.is_protected,
  };
  next();
}

// Проверка конкретного права. Владелец (__all) проходит всегда.
export const can = (perm) => (req, res, next) => {
  const p = req.user?.perms || {};
  if (p.__all || p[perm]) return next();
  return res.status(403).json({ error: "Недостаточно прав" });
};

export const canAny = (...perms) => (req, res, next) => {
  const p = req.user?.perms || {};
  if (p.__all || perms.some((k) => p[k])) return next();
  return res.status(403).json({ error: "Недостаточно прав" });
};

export function requireClient(req, res, next) {
  const u = readToken(req);
  if (!u || u.role !== "client") return res.status(401).json({ error: "Нужен вход клиента" });
  req.user = u;
  next();
}

// Авторизация контроллера СКУД по API-ключу (заголовок x-skud-key)
export function requireSkud(req, res, next) {
  const key = req.headers["x-skud-key"];
  if (!key || key !== process.env.SKUD_API_KEY) return res.status(401).json({ error: "Неверный ключ СКУД" });
  next();
}
