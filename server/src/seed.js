import "dotenv/config";
import { pool, q } from "./db.js";
import { hash } from "./auth.js";
import { PRESET_OWNER, PRESET_ADMIN, PRESET_TRAINER } from "./permissions.js";

const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@karate.ru";
const adminPass = process.env.SEED_ADMIN_PASSWORD || "admin123";

async function ensureRole(name, scope, perms, protectedRole = false) {
  const { rows: [r] } = await q("SELECT id FROM roles WHERE name=$1", [name]);
  if (r) return r.id;
  const { rows: [n] } = await q(
    "INSERT INTO roles(name,scope,permissions,is_protected) VALUES($1,$2,$3,$4) RETURNING id",
    [name, scope, perms, protectedRole]);
  return n.id;
}

async function run() {
  // Роли
  const ownerId = await ensureRole("Владелец", "all", PRESET_OWNER, true);
  await ensureRole("Администратор", "all", PRESET_ADMIN, false);
  await ensureRole("Тренер", "own", PRESET_TRAINER, false);

  // Настройки центра (можно менять в админке)
  const settings = {
    club_name: "Школа каратэ Николаевой Антонины",
    currency: "₽",
    skud_once_per_day: "true",
    skud_deny_without_sub: "false",       // без абонемента пропускаем, но помечаем долг
    loyalty_cashback_percent: "0",        // % баллов с покупок
    referral_referrer_percent: "5",       // % пригласившему с первой покупки друга
    referral_friend_percent: "0",         // бонус самому другу
    points_to_currency: "1",              // 1 балл = 1 ₽
  };
  for (const [k, v] of Object.entries(settings))
    await q("INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING", [k, v]);

  // Владелец: создать первого / назначить роль владельца существующим без роли
  const { rows: [{ count }] } = await q("SELECT count(*)::int FROM admins");
  if (count === 0) {
    await q("INSERT INTO admins(email,password_hash,name,role_id) VALUES($1,$2,$3,$4)",
      [adminEmail, await hash(adminPass), "Владелец", ownerId]);
    console.log(`✓ Владелец: ${adminEmail} / ${adminPass}`);
  } else {
    await q("UPDATE admins SET role_id=$1 WHERE role_id IS NULL", [ownerId]);
    console.log("✓ Существующим сотрудникам без роли назначена роль «Владелец»");
  }

  // Направление
  await q("INSERT INTO disciplines(name,color) SELECT $1,$2 WHERE NOT EXISTS (SELECT 1 FROM disciplines WHERE name=$1)",
    ["Каратэ", "#DC2626"]);

  console.log("✓ Сид завершён");
}

run().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
