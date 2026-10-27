import { newDb } from "pg-mem";
import { setPool, initDb } from "../src/db.js";

// fresh in-memory Postgres for each test file
export async function useMemoryDb() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  setPool(new Pool());
  await initDb();
}
