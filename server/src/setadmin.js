// Смена email и пароля сотрудника (или создание владельца).
// Запуск на сервере:
//   cd /opt/karate/server && npm run set-admin -- ПОЧТА ПАРОЛЬ ["Имя"]
// Если сотрудник с такой почтой есть — меняется пароль (и имя, если указано).
// Если нет — создаётся новый сотрудник с ролью «Владелец».
import "dotenv/config";
import { pool, q } from "./db.js";
import { hash } from "./auth.js";

const [email, password, name] = process.argv.slice(2);

if (!email || !password) {
  console.error('Как пользоваться: npm run set-admin -- почта пароль ["Имя"]');
  process.exit(1);
}

async function run() {
  const { rows: [ex] } = await q("SELECT id, name FROM admins WHERE lower(email)=lower($1)", [email]);
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
  const { rows } = await q("SELECT a.email, a.name, r.name AS role FROM admins a LEFT JOIN roles r ON r.id=a.role_id ORDER BY a.created_at");
  console.log("\nСотрудники в системе:");
  for (const r of rows) console.log(` · ${r.email} — ${r.name || "без имени"} (${r.role || "без роли"})`);
}

run().then(() => pool.end()).catch((e) => { console.error(e.message); process.exit(1); });
