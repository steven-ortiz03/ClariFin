import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { config, pool } from '../backend/src/config/db.js';
const db = await mysql.createConnection({
  ...config,
  multipleStatements: true,
});
try {
  const [[row]] = await db.query(
    "SELECT GET_LOCK(CONCAT(DATABASE(), '.migrate'),30) AS acquired",
  );
  if (!row.acquired) throw new Error('No se obtuvo el bloqueo de migración.');
  await db.query(
    await readFile(new URL('./001_inicial.sql', import.meta.url), 'utf8'),
  );
  console.log('Esquema 001 aplicado.');
} finally {
  await db.end();
  await pool.end();
}
