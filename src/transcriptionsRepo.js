import { query } from "./db.js";

const COLUMNS = "id, title, text, language, engine, duration_seconds, created_at, updated_at";

export async function list({ q, skip, limit }) {
  const params = [];
  let where = "";
  if (q) {
    params.push(`%${q}%`);
    where = "WHERE title ILIKE $1 OR text ILIKE $1";
  }

  const countResult = await query(`SELECT COUNT(*) AS total FROM transcriptions ${where}`, params);
  const rows = await query(
    `SELECT ${COLUMNS} FROM transcriptions ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, skip]
  );
  return { items: rows.rows, total: Number(countResult.rows[0].total) };
}

export async function findById(id) {
  const result = await query(`SELECT ${COLUMNS} FROM transcriptions WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function create({ title, text, language, engine, duration_seconds }) {
  const result = await query(
    `INSERT INTO transcriptions (title, text, language, engine, duration_seconds)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [title, text, language, engine, duration_seconds]
  );
  return result.rows[0];
}

export async function update(id, { title, text, language }) {
  const result = await query(
    `UPDATE transcriptions
        SET title = COALESCE($2, title),
            text = COALESCE($3, text),
            language = COALESCE($4, language),
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, title ?? null, text ?? null, language ?? null]
  );
  return result.rows[0] || null;
}

export async function remove(id) {
  const result = await query("DELETE FROM transcriptions WHERE id = $1", [id]);
  return result.rowCount > 0;
}
