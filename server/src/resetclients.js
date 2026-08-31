// Полная очистка базы клиентов из консоли сервера.
//
//   npm run reset-clients                 показать, что будет удалено (ничего не трогает)
//   npm run reset-clients -- --yes        удалить всех клиентов и связанные данные
//   npm run reset-clients -- --yes --leads   заодно очистить воронку продаж (заявки)
//   npm run reset-clients -- --yes --no-backup   без резервной копии (не рекомендуется)
//
// Вместе с клиентами удаляются их абонементы, оплаты, посещения, записи,
// баллы, приглашения и задачи — это единая история клиента.
// Настройки, филиалы, тарифы, расписание, тренеры и сотрудники остаются.
// Перед удалением делается резервная копия базы в /opt/karate/backups.
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { pool, q } from "./db.js";

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const withLeads = args.includes("--leads");
const noBackup = args.includes("--no-backup");

// Что сейчас в базе
async function counts() {
  const one = async (sql) => Number((await q(sql)).rows[0].n);
  return {
    Клиенты: await one("SELECT count(*) n FROM clients"),
    Абонементы: await one("SELECT count(*) n FROM client_subscriptions"),
    Оплаты: await one("SELECT count(*) n FROM payments"),
    "Отметки посещений": await one("SELECT count(*) n FROM bookings"),
    "Персональные записи": await one("SELECT count(*) n FROM personal_bookings"),
    "Заявки (воронка)": await one("SELECT count(*) n FROM leads"),
  };
}

// Резервная копия перед удалением — единственный способ вернуть данные назад
function backup() {
  const url = new URL(process.env.DATABASE_URL);
  const dir = "/opt/karate/backups";
  const dest = `${dir}/before_reset_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.sql.gz`;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  execFileSync("bash", ["-c",
    `PGPASSWORD='${decodeURIComponent(url.password)}' pg_dump -h ${url.hostname} -p ${url.port || 5432} ` +
    `-U ${decodeURIComponent(url.username)} ${url.pathname.slice(1)} | gzip > '${dest}'`]);
  return dest;
}

(async () => {
  const before = await counts();
  console.log("\nСейчас в базе:");
  for (const [k, v] of Object.entries(before)) console.log(` · ${k}: ${v}`);

  if (!confirmed) {
    console.log("\nБудут удалены клиенты и вся их история (абонементы, оплаты, посещения, баллы).");
    console.log("Филиалы, тарифы, расписание, тренеры и сотрудники останутся.");
    console.log("\nЕсли действительно нужно обнулить базу клиентов, выполните:");
    console.log("   npm run reset-clients -- --yes");
    console.log("Чтобы заодно очистить заявки в воронке продаж, добавьте --leads\n");
    await pool.end();
    return;
  }

  if (!noBackup) {
    try {
      console.log("\nДелаю резервную копию базы…");
      console.log("✓ Копия: " + backup());
    } catch (e) {
      console.error("\n✗ Не удалось сделать копию: " + e.message);
      console.error("Сделайте её вручную (bash /opt/karate/deploy/backup.sh) или повторите с --no-backup.");
      await pool.end();
      process.exitCode = 1;
      return;
    }
  }

  await q("DELETE FROM clients");                 // остальное уходит по каскаду
  if (withLeads) await q("DELETE FROM leads");

  const after = await counts();
  console.log("\n✓ База клиентов обнулена. Осталось:");
  for (const [k, v] of Object.entries(after)) console.log(` · ${k}: ${v}`);
  console.log("");
  await pool.end();
})().catch(async (e) => { console.error("Ошибка: " + e.message); await pool.end(); process.exitCode = 1; });
