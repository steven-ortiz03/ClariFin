import { rows, pool, transaction } from '../config/db.js';
import { own, category, lockUser, audit } from '../core/repository.js';
import { today, requireThat } from '../core/validation.js';
export function nextMonth(period) {
  const year = Number(period.slice(0, 4)),
    month = Number(period.slice(5, 7));
  return month === 12
    ? year + 1 + '-01-01'
    : year + '-' + String(month + 1).padStart(2, '0') + '-01';
}
export function dueDate(period, day) {
  const last = new Date(
    Date.UTC(+period.slice(0, 4), +period.slice(5, 7), 0),
  ).getUTCDate();
  return (
    period.slice(0, 7) + '-' + String(Math.min(day, last)).padStart(2, '0')
  );
}
// The owner row is already locked. Materialize elapsed months before editing a schedule.
export async function generate(db, user, asOf = today()) {
  const end = asOf.slice(0, 7) + '-01';
  const schedules = await rows(
    db,
    'SELECT * FROM programaciones_recurrentes WHERE userId=? AND active=1 AND nextMonth<=?',
    [user, end],
  );
  for (const s of schedules) {
    let month = s.nextMonth;
    while (month <= end) {
      const due = dueDate(month, s.dueDay);
      if (due >= s.startDate)
        await rows(
          db,
          `INSERT INTO compromisos(userId,scheduleId,name,categoryId,period,dueDate,expected,isVariable)
        VALUES (?,?,?,?,?,?,?,?)`,
          [
            user,
            s.id,
            s.name,
            s.categoryId,
            month,
            due,
            s.estimatedAmount,
            s.isVariable,
          ],
        );
      month = nextMonth(month);
    }
    await rows(
      db,
      'UPDATE programaciones_recurrentes SET nextMonth=? WHERE id=?',
      [month, s.id],
    );
  }
}
export const catchUp = (user) =>
  transaction(async (db) => {
    await lockUser(db, user);
    await generate(db, user);
  });
export async function catchUpAll() {
  const users = await rows(
    pool,
    'SELECT DISTINCT userId FROM programaciones_recurrentes WHERE active=1 AND nextMonth<=?',
    [today().slice(0, 7) + '-01'],
  );
  for (const { userId } of users) await catchUp(userId);
}
export async function createSchedule({ db, user }, b) {
  await category(db, user, b.categoryId, 'expense');
  const r = await rows(
    db,
    `INSERT INTO programaciones_recurrentes(userId,name,categoryId,estimatedAmount,dueDay,startDate,nextMonth,isVariable)
    VALUES (?,?,?,?,?,?,?,?)`,
    [
      user,
      b.name,
      b.categoryId,
      b.estimatedAmount,
      b.dueDay,
      b.startDate,
      b.startDate.slice(0, 7) + '-01',
      b.isVariable,
    ],
  );
  await generate(db, user);
  return { id: r.insertId };
}
export async function editSchedule({ db, user }, id, b) {
  await generate(db, user);
  const s = await own(db, 'programaciones_recurrentes', user, id);
  if (b.categoryId !== undefined)
    await category(
      db,
      user,
      b.categoryId,
      'expense',
      s.categoryId !== b.categoryId,
    );
  const n = { ...s, ...b };
  // Reactivation starts with the next unissued active month; preserve an original future start.
  let cursor = s.nextMonth;
  if (!s.active && n.active)
    cursor = [cursor, today().slice(0, 7) + '-01'].sort().at(-1);
  await rows(
    db,
    'UPDATE programaciones_recurrentes SET name=?,categoryId=?,estimatedAmount=?,dueDay=?,isVariable=?,active=?,nextMonth=? WHERE id=?',
    [
      n.name,
      n.categoryId,
      n.estimatedAmount,
      n.dueDay,
      n.isVariable,
      n.active,
      cursor,
      id,
    ],
  );
  await generate(db, user);
  return { id };
}
export const commitments = (db, user) =>
  rows(
    db,
    `SELECT c.*,expected-paid AS remaining,
  CASE WHEN paid=expected THEN 'paid' WHEN paid>0 THEN 'partial' ELSE 'pending' END AS status,
  IF(paid<expected,GREATEST(0,DATEDIFF(?,dueDate)),0) AS lateDays,
  (paid<expected AND DATEDIFF(dueDate,?) BETWEEN 0 AND 3) AS reminder
  FROM cartera c WHERE userId=? ORDER BY dueDate DESC,id DESC`,
    [today(), today(), user],
  );
export async function changeExpected({ db, user }, id, b) {
  const [c] = await rows(db, 'SELECT * FROM cartera WHERE userId=? AND id=?', [
    user,
    id,
  ]);
  requireThat(c, 404, 'NOT_FOUND', 'Compromiso no disponible.');
  requireThat(
    c.isVariable && !c.hasPayments,
    422,
    'AMOUNT_LOCKED',
    'Solo puedes ajustar un importe variable antes del primer abono.',
  );
  await rows(db, 'UPDATE compromisos SET expected=? WHERE id=?', [
    b.amount,
    id,
  ]);
  await audit(db, user, 'commitment', id, 'importe', c.expected, b.amount);
  return { id, expected: b.amount };
}
