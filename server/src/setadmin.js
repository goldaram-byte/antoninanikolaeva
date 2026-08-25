// Управление учётными записями сотрудников из консоли сервера.
//
//   npm run set-admin -- ПОЧТА ПАРОЛЬ ["Имя"]   создать сотрудника-владельца
//                                               или сменить пароль существующему
//   npm run set-admin -- --delete ПОЧТА         удалить сотрудника
//   npm run set-admin -- --list                 показать список сотрудников
//
// Последнего сотрудника удалить нельзя — иначе в систему будет не войти.
import "dotenv/config";
import { pool, q } from "./db.js";
import { hash } from "./auth.js";

const args = process.argv.slice(2);

async function list() {
  const { rows } = await q(
    `SELECT a.email, a.name, r.name AS role FROM admins a
     LEFT JOIN roles r ON r.id = a.role_id ORDER BY a.created_at`);
  console.log("\nСотрудники в системе:");
  for (const r of rows) console.log(` · ${r.email} — ${r.name || "без имени"} (${r.role || "без роли"})`);
  console.log("");
}

async function run() {
  if (args[0] === "--list") return list();

  if (args[0] === "--delete") {
    const email = args[1];
    if (!email) throw new Error("Укажите почту: npm run set-admin -- --delete pochta@example.ru");
    const { rows: [{ count }] } = await q("SELECT count(*)::int FROM admins");
    if (count <= 1) throw new Error("Это последний сотрудник — удалять нельзя, иначе в систему не войти.");
    const { rowCount } = await q("DELETE FROM admins WHERE lower(email)=lower($1)", [email]);
    if (!rowCount) throw new Error(`Сотрудник ${email} не найден`);
    console.log(`✓ Удалён: ${email}`);
    return list();
  }

  const [email, password, name] = args;
  if (!email || !password) {
    console.error('Как пользоваться:');
    console.error('  npm run set-admin -- pochta@example.ru Пароль123 "Имя Фамилия"   создать / сменить пароль');
    console.error('  npm run set-admin -- --delete pochta@example.ru                  удалить сотрудника');
    console.error('  npm run set-admin -- --list                                      список сотрудников');
    process.exit(1);
  }
  if (String(password).length < 8) throw new Error("Пароль должен быть не короче 8 символов");

  const { rows: [ex] } = await q("SELECT id FROM admins WHERE lower(email)=lower($1)", [email]);
  const h = await hash(password);
  if (ex) {
    await q("UPDATE admins SET password_hash=$1, name=COALESCE($2, name) WHERE id=$3", [h, name || null, ex.id]);
    console.log(`✓ Пароль обновлён: ${email}`);
  } else {
    const { rows: [owner] } = await q("SELECT id FROM roles WHERE is_protected=true LIMIT 1");
    await q("INSERT INTO admins(email, password_hash, name, role_id) VALUES($1,$2,$3,$4)",
      [email, h, name || "Владелец", owner?.id || null]);
    console.log(`✓ Создан сотрудник с правами владельца: ${email}`);
  }
  return list();
}

run().then(() => pool.end()).catch((e) => { console.error("✗ " + e.message); pool.end(); process.exit(1); });
