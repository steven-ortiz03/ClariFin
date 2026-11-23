import { rows } from '../config/db.js';
import { z } from 'zod';
import {
  id,
  day,
  today,
  requireThat,
  cents,
  decimal,
} from '../core/validation.js';
const filter = z.object({
  from: day.optional(),
  to: day.optional(),
  type: z
    .enum(['income', 'expense', 'transfer', 'opening', 'adjustment'])
    .optional(),
  accountId: id.optional(),
  categoryId: id.optional(),
  page: id.default(1),
  size: z.coerce.number().int().min(1).max(100).default(40),
});
function where(user, query) {
  const q = filter.parse(query);
  requireThat(
    !q.from || !q.to || q.from <= q.to,
    400,
    'DATE_RANGE',
    'El inicio debe ser anterior al final.',
  );
  const parts = ['m.userId=?'],
    p = [user];
  for (const [key, sql] of [
    ['from', 'm.date>=?'],
    ['to', 'm.date<=?'],
    ['type', 'm.type=?'],
    ['categoryId', 'm.categoryId=?'],
  ]) {
    if (q[key] !== undefined) {
      parts.push(sql);
      p.push(q[key]);
    }
  }
  if (q.accountId) {
    parts.push('(m.accountId=? OR m.destinationId=?)');
    p.push(q.accountId, q.accountId);
  }
  return { sql: parts.join(' AND '), p, q };
}
export async function history(db, user, query) {
  const { sql, p, q } = where(user, query);
  const [count] = await rows(
    db,
    'SELECT COUNT(*) AS total FROM movimientos m WHERE ' + sql,
    p,
  );
  const items = await rows(
    db,
    `SELECT m.*,a.name AS accountName,c.name AS categoryName,d.name AS destinationName
    FROM movimientos m JOIN cuentas a ON a.id=m.accountId LEFT JOIN cuentas d ON d.id=m.destinationId
    LEFT JOIN categorias c ON c.id=m.categoryId WHERE ` +
      sql +
      ' ORDER BY date DESC,id DESC LIMIT ' +
      q.size +
      ' OFFSET ' +
      (q.page - 1) * q.size,
    p,
  );
  return { items, total: count.total, page: q.page };
}
export const accounts = (db, user, asOf = today()) =>
  rows(
    db,
    `SELECT a.*,COALESCE(
  (SELECT SUM(delta) FROM apuntes p WHERE p.userId=a.userId AND p.accountId=a.id AND date<=?),0.00) AS balance
  FROM cuentas a WHERE a.userId=? ORDER BY a.active DESC,a.id`,
    [day.parse(asOf), user],
  );
export async function report(db, user, query) {
  const { sql, p, q } = where(user, query);
  const source =
    ' FROM movimientos m LEFT JOIN categorias c ON c.id=m.categoryId WHERE ' +
    sql +
    " AND m.voided=0 AND m.type IN ('income','expense')";
  const [totals] = await rows(
    db,
    `SELECT COALESCE(SUM(IF(m.type='income',m.amount,0)),0.00) AS income,
    COALESCE(SUM(IF(m.type='expense',m.amount,0)),0.00) AS expense,
    COALESCE(SUM(IF(m.type='income',m.amount,-m.amount)),0.00) AS net` + source,
    p,
  );
  const categories = await rows(
    db,
    'SELECT m.type,c.name AS label,SUM(m.amount) AS amount' +
      source +
      ' GROUP BY m.type,c.id,c.name ORDER BY amount DESC',
    p,
  );
  const periods = await rows(
    db,
    "SELECT DATE_FORMAT(m.date,'%Y-%m') AS label,m.type,SUM(m.amount) AS amount" +
      source +
      ' GROUP BY label,m.type ORDER BY label,m.type',
    p,
  );
  const balances = (await accounts(db, user, q.to || today())).filter(
    (a) => !q.accountId || a.id === q.accountId,
  );
  const balanceTotal = decimal(
    balances.reduce((sum, a) => sum + cents(a.balance), 0n),
  );
  return { totals, categories, periods, balances, balanceTotal };
}
