import pg from "pg";
import "dotenv/config";

// NUMERIC возвращаем как number, а не строку
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // На некоторых российских облаках managed-Postgres требует SSL.
  // Тогда раскомментируйте: ssl: { rejectUnauthorized: false }
});

export const q = (text, params) => pool.query(text, params);

// Helper для транзакций
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await fn(client);
    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
