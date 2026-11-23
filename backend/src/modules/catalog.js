import { rows } from '../config/db.js';
import { own } from '../core/repository.js';
import { saveEntry } from './ledger.js';
import { today, requireThat } from '../core/validation.js';
export const presets = {
  income: ['Salario', 'Trabajo independiente', 'Regalos', 'Otros ingresos'],
  expense: [
    'Alimentación',
    'Transporte',
    'Vivienda',
    'Servicios públicos',
    'Entretenimiento',
    'Otros gastos',
  ],
};
export async function createAccount(ctx, b) {
  const r = await rows(
    ctx.db,
    'INSERT INTO cuentas(userId,name) VALUES (?,?)',
    [ctx.user, b.name],
  );
  await saveEntry(
    ctx,
    {
      accountId: r.insertId,
      type: 'opening',
      amount: b.openingBalance,
      date: b.date || today(),
      description: 'Saldo de apertura',
    },
    null,
    r.insertId,
  );
  return { id: r.insertId };
}
export async function editCatalog(ctx, table, id, b) {
  await own(ctx.db, table, ctx.user, id);
  if (b.name !== undefined)
    await rows(ctx.db, 'UPDATE ' + table + ' SET name=? WHERE id=?', [
      b.name,
      id,
    ]);
  if (b.active !== undefined)
    await rows(ctx.db, 'UPDATE ' + table + ' SET active=? WHERE id=?', [
      b.active,
      id,
    ]);
  return own(ctx.db, table, ctx.user, id);
}
export async function createCategory(ctx, b) {
  const r = await rows(
    ctx.db,
    'INSERT INTO categorias(userId,name,type) VALUES (?,?,?)',
    [ctx.user, b.name, b.type],
  );
  return { id: r.insertId };
}
const count = async (db, sql, params) => Number((await rows(db, sql, params))[0].n);
// Solo se elimina una cuenta sin historial propio: su único movimiento es el saldo de apertura.
export async function deleteAccount(ctx, b, id) {
  const { db, user } = ctx;
  await own(db, 'cuentas', user, id);
  const used = await count(
    db,
    "SELECT COUNT(*) AS n FROM movimientos WHERE userId=? AND (accountId=? OR destinationId=?) AND type<>'opening'",
    [user, id, id],
  );
  requireThat(
    used === 0,
    409,
    'IN_USE',
    'La cuenta tiene movimientos. Desactívala para conservar su historial.',
  );
  await rows(
    db,
    'DELETE a FROM auditoria_movimientos a JOIN movimientos m ON m.id=a.movementId WHERE m.userId=? AND m.accountId=?',
    [user, id],
  );
  await rows(db, 'DELETE FROM movimientos WHERE userId=? AND accountId=?', [
    user,
    id,
  ]);
  await rows(db, 'DELETE FROM cuentas WHERE userId=? AND id=?', [user, id]);
  return { id, deleted: true };
}
// Una categoría solo se elimina si ningún movimiento, presupuesto ni compromiso la usa.
export async function deleteCategory(ctx, b, id) {
  const { db, user } = ctx;
  await own(db, 'categorias', user, id);
  let used = 0;
  for (const table of [
    'movimientos',
    'presupuestos',
    'programaciones_recurrentes',
    'compromisos',
  ])
    used += await count(
      db,
      'SELECT COUNT(*) AS n FROM ' + table + ' WHERE userId=? AND categoryId=?',
      [user, id],
    );
  requireThat(
    used === 0,
    409,
    'IN_USE',
    'La categoría está en uso. Desactívala para conservar su historial.',
  );
  await rows(db, 'DELETE FROM categorias WHERE userId=? AND id=?', [user, id]);
  return { id, deleted: true };
}
