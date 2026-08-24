// Тонкая обёртка над fetch. Базовый адрес — из VITE_API_URL.
// В прод-сборке API живёт на том же домене (nginx проксирует /api), поэтому пусто;
// в режиме разработки — локальный сервер на :4000.
const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : "");

export const getToken = () => localStorage.getItem("token");
export const setSession = (token, role, name, extra = {}) => {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
  localStorage.setItem("name", name || "");
  localStorage.setItem("perms", JSON.stringify(extra.perms || {}));
  localStorage.setItem("scope", extra.scope || "all");
  localStorage.setItem("roleName", extra.roleName || "");
  localStorage.setItem("isOwner", extra.isOwner ? "1" : "");
};
export const clearSession = () => {
  ["token", "role", "name", "perms", "scope", "roleName", "isOwner"].forEach((k) => localStorage.removeItem(k));
};

// Права текущего сотрудника
export const getPerms = () => { try { return JSON.parse(localStorage.getItem("perms") || "{}"); } catch { return {}; } };
export const hasPerm = (key) => { const p = getPerms(); return !!(p.__all || p[key]); };
export const isOwner = () => localStorage.getItem("isOwner") === "1";
export const roleName = () => localStorage.getItem("roleName") || "Сотрудник";

async function req(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearSession();
    location.href = "/admin/login";
    throw new Error("Сессия истекла");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Ошибка ${res.status}`);
  return data;
}

export const api = {
  get: (p) => req(p),
  post: (p, b) => req(p, { method: "POST", body: b }),
  put: (p, b) => req(p, { method: "PUT", body: b }),
  patch: (p, b) => req(p, { method: "PATCH", body: b }),
  del: (p) => req(p, { method: "DELETE" }),
  adminLogin: (email, password) => req("/api/auth/admin/login", { method: "POST", body: { email, password }, auth: false }),
};

// Полный URL к загруженной картинке на сервере
export const mediaUrl = (path) => (path ? BASE + path : "");

// Ссылки на мессенджеры по номеру телефона (для карточки клиента)
export const phoneDigits = (phone) => {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  return d;
};
export const waLink = (phone) => `https://wa.me/${phoneDigits(phone)}`;
export const tgLink = (phone) => `https://t.me/+${phoneDigits(phone)}`;
export const telLink = (phone) => `tel:+${phoneDigits(phone)}`;
