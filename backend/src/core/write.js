import { createHash } from 'node:crypto';
import { transaction, rows } from '../config/db.js';
import { lockUser } from './repository.js';
import { requireThat, cents, decimal } from './validation.js';
function canonical(data) {
  if (Array.isArray(data)) return data.map(canonical);
  if (data && typeof data === 'object')
    return Object.fromEntries(
      Object.keys(data)
        .sort()
        .map((k) => [k, canonical(data[k])]),
    );
  return data;
}
export async function write(user, key, route, body, work) {
  requireThat(
    typeof key === 'string' && /^[\w-]{12,80}$/.test(key),
    400,
    'KEY',
    'Se requiere Idempotency-Key (12 a 80 caracteres).',
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([route, canonical(body)]))
    .digest('hex');
  return transaction(async (db) => {
    await lockUser(db, user);
    const [saved] = await rows(
      db,
      'SELECT fingerprint,result FROM operaciones_idempotentes WHERE userId=? AND operationKey=?',
      [user, key],
    );
    if (saved) {
      requireThat(
        saved.fingerprint === fingerprint,
        409,
        'KEY_CONFLICT',
        'La clave ya corresponde a otra operación.',
      );
      return saved.result;
    }
    const result = await work({ db, user, key, fingerprint });
    await rows(db, 'INSERT INTO operaciones_idempotentes VALUES (?,?,?,?)', [
      user,
      key,
      fingerprint,
      JSON.stringify(result),
    ]);
    return result;
  });
}
const pesos = (c) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  }).format(Number(decimal(c)));
// Ninguna operación puede dejar una cuenta por debajo de cero. Las operaciones
// que no empeoran un saldo ya negativo (datos anteriores) siguen permitidas.
export async function checkBalances(ctx, deltas, newAccount) {
  for (const [accountId, change] of [...deltas].sort((a, b) => a[0] - b[0])) {
    const [row] = await rows(
      ctx.db,
      'SELECT COALESCE(SUM(delta),0.00) AS balance FROM apuntes WHERE userId=? AND accountId=?',
      [ctx.user, accountId],
    );
    const current = cents(row.balance),
      result = current + change;
    requireThat(
      result <= 999999999999999n && result >= -999999999999999n,
      422,
      'BALANCE_RANGE',
      'El saldo supera la precisión admitida.',
    );
    if (result >= 0n || result >= current) continue;
    if (accountId === newAccount)
      requireThat(
        false,
        422,
        'NEGATIVE_OPENING',
        'El saldo inicial no puede ser negativo.',
      );
    const [account] = await rows(
      ctx.db,
      'SELECT name FROM cuentas WHERE userId=? AND id=?',
      [ctx.user, accountId],
    );
    const available = current > 0n ? current : 0n;
    requireThat(
      false,
      422,
      'INSUFFICIENT_FUNDS',
      'Saldo insuficiente en «' +
        (account?.name ?? 'la cuenta') +
        '»: disponible ' +
        pesos(available) +
        ', la operación necesita ' +
        pesos(-change) +
        '.',
      {
        accountId,
        accountName: account?.name,
        currentBalance: decimal(current),
        resultingBalance: decimal(result),
      },
    );
  }
}
