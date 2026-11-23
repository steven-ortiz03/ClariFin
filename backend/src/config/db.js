import mysql from 'mysql2/promise';
export const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'finanzas',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'gestion_financiera',
  charset: 'utf8mb4',
  dateStrings: true,
  timezone: 'Z',
  decimalNumbers: false,
};
export const pool = mysql.createPool({ ...config, connectionLimit: 8 });
export async function rows(db, sql, params = []) {
  return (await db.execute(sql, params))[0];
}
export async function transaction(work) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await work(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
