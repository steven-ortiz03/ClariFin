import { rows } from '../config/db.js';
import { own, category, audit } from '../core/repository.js';
import { cents, requireThat } from '../core/validation.js';
import { checkBalances } from '../core/write.js';
import { syncAlerts } from './budgets.js';

function addEffect(deltas, entry, direction) {
  const amount = cents(entry.amount) * direction;
  const add = (id, n) => deltas.set(id, (deltas.get(id) || 0n) + n);
  add(
    entry.accountId,
    ['expense', 'transfer'].includes(entry.type) ? -amount : amount,
  );
  if (entry.destinationId) add(entry.destinationId, amount);
}
export async function saveEntry(ctx, next, previous = null, newAccount = null) {
  const { db, user } = ctx;
  const deltas = new Map();
  if (previous) addEffect(deltas, previous, -1n);
  if (next) {
    await own(
      db,
      'cuentas',
      user,
      next.accountId,
      previous?.accountId !== next.accountId,
    );
    if (next.destinationId) {
      requireThat(
        next.accountId !== next.destinationId,
        422,
        'SAME_ACCOUNT',
        'Elige dos cuentas distintas.',
      );
      await own(db, 'cuentas', user, next.destinationId, true);
    }
    if (next.categoryId)
      await category(
        db,
        user,
        next.categoryId,
        next.type,
        !next.commitmentId && previous?.categoryId !== next.categoryId,
      );
    addEffect(deltas, next, 1n);
  }
  await checkBalances(ctx, deltas, newAccount);
  let id = previous?.id;
  if (!previous) {
    const r = await rows(
      db,
      `INSERT INTO movimientos(userId,type,accountId,destinationId,categoryId,commitmentId,amount,date,description)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        user,
        next.type,
        next.accountId,
        next.destinationId || null,
        next.categoryId || null,
        next.commitmentId || null,
        next.amount,
        next.date,
        next.description,
      ],
    );
    id = r.insertId;
  } else if (next) {
    await rows(
      db,
      `UPDATE movimientos SET type=?,accountId=?,categoryId=?,amount=?,date=?,description=?,version=version+1 WHERE id=?`,
      [
        next.type,
        next.accountId,
        next.categoryId,
        next.amount,
        next.date,
        next.description,
        id,
      ],
    );
  } else {
    await rows(
      db,
      'UPDATE movimientos SET voided=1,version=version+1 WHERE id=?',
      [id],
    );
  }
  const entry = await own(db, 'movimientos', user, id);
  await audit(
    db,
    user,
    'movement',
    id,
    !previous ? 'alta' : next ? 'corrección' : 'anulación',
    previous,
    entry,
  );
  if ([next?.type, previous?.type].includes('expense'))
    await syncAlerts(db, user);
  return entry;
}
export async function changeMovement(ctx, id, body, kind, voiding = false) {
  const before = await own(ctx.db, 'movimientos', ctx.user, id);
  requireThat(
    !before.voided && before.version === body.version,
    409,
    'STALE',
    'El registro cambió. Actualiza el historial.',
  );
  const actual = before.commitmentId
    ? 'payment'
    : before.type === 'transfer'
      ? 'transfer'
      : ['income', 'expense'].includes(before.type)
        ? 'movement'
        : 'opening';
  requireThat(
    actual === kind,
    422,
    'WRONG_FLOW',
    'Usa el flujo correspondiente al registro.',
  );
  if (voiding) return saveEntry(ctx, null, before);
  if (kind === 'payment') {
    await withinRemaining(ctx, before.commitmentId, body.amount, before.amount);
    return saveEntry(ctx, { ...before, ...body }, before);
  }
  return saveEntry(ctx, body, before);
}
async function withinRemaining({ db, user }, id, value, previous = '0.00') {
  const [c] = await rows(db, 'SELECT * FROM cartera WHERE userId=? AND id=?', [
    user,
    id,
  ]);
  requireThat(c, 404, 'NOT_FOUND', 'Compromiso no disponible.');
  requireThat(
    cents(value) <= cents(c.expected) - cents(c.paid) + cents(previous),
    422,
    'OVERPAY',
    'El abono supera el importe pendiente.',
  );
  return c;
}
export async function pay(ctx, id, body) {
  const c = await withinRemaining(ctx, id, body.amount);
  return saveEntry(ctx, {
    ...body,
    type: 'expense',
    categoryId: c.categoryId,
    commitmentId: id,
    description: body.description || c.name,
  });
}
export async function detail(db, user, id) {
  const entry = await own(db, 'movimientos', user, id);
  const audit = await rows(
    db,
    'SELECT action,previousValue,newValue,createdAt FROM auditoria_movimientos WHERE userId=? AND movementId=? ORDER BY id',
    [user, id],
  );
  return { ...entry, audit };
}
