import pg from "pg";
import { config } from "./config.js";

let pool = null;

export function getPool() {
  if (!pool) pool = new pg.Pool({ connectionString: config.databaseUrl });
  return pool;
}

// lets the tests swap in an in-memory database
export function setPool(customPool) {
  pool = customPool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS transcriptions (
      id               SERIAL PRIMARY KEY,
      title            VARCHAR(200) NOT NULL DEFAULT 'Untitled',
      text             TEXT NOT NULL,
      language         VARCHAR(50),
      engine           VARCHAR(30),
      duration_seconds REAL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
