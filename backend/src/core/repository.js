import { rows } from '../config/db.js';
import { requireThat } from './validation.js';
const allowed = new Set([
  'usuarios',
  'cuentas',
  'categorias',
  'movimientos',
  'compromisos',
  'presupuestos',
  'programaciones_recurrentes',
]);
export async function own(db, table, user, id, active = false) {
  if (!allowed.has(table) || table === 'usuarios')
    throw Error('Entidad no válida');
  const [item] = await rows(
    db,
    'SELECT * FROM ' + table + ' WHERE userId=? AND id=?',
    [user, id],
  );
  requireThat(item, 404, 'NOT_FOUND', 'El registro no está disponible.');
  requireThat(
    !active || item.active,
    422,
    'INACTIVE',
    'El registro está inactivo.',
  );
  return item;
}
export async function category(db, user, id, type, active = true) {
  const item = await own(db, 'categorias', user, id, active);
  requireThat(
    item.type === type,
    422,
    'CATEGORY_TYPE',
    'La categoría no corresponde al tipo de movimiento.',
  );
  return item;
}
export async function lockUser(db, user) {
  await rows(db, 'SELECT id FROM usuarios WHERE id=? FOR UPDATE', [user]);
}
export async function audit(db, user, kind, id, action, before, after) {
  await rows(
    db,
    'INSERT INTO auditoria_movimientos (userId,movementId,commitmentId,action,previousValue,newValue) VALUES (?,?,?,?,?,?)',
    [
      user,
      kind === 'movement' ? id : null,
      kind === 'commitment' ? id : null,
      action,
      JSON.stringify(before),
      JSON.stringify(after),
    ],
  );
}
