import { rows } from '../config/db.js';
import { category, own } from '../core/repository.js';
export async function syncAlerts(db, user) {
  for (const threshold of [80, 100]) {
    await rows(
      db,
      `INSERT INTO alertas(budgetId,threshold)
      SELECT p.id,? FROM progreso p WHERE p.userId=? AND p.used*100>=p.limitAmount*?
      AND NOT EXISTS(SELECT 1 FROM alertas a WHERE a.budgetId=p.id AND a.threshold=?)`,
      [threshold, user, threshold, threshold],
    );
  }
}
export async function budget(ctx, b, id) {
  if (id) {
    await own(ctx.db, 'presupuestos', ctx.user, id);
    await rows(ctx.db, 'UPDATE presupuestos SET limitAmount=? WHERE id=?', [
      b.limitAmount,
      id,
    ]);
  } else {
    await category(ctx.db, ctx.user, b.categoryId, 'expense');
    const r = await rows(
      ctx.db,
      'INSERT INTO presupuestos(userId,categoryId,period,limitAmount) VALUES (?,?,?,?)',
      [ctx.user, b.categoryId, b.period + '-01', b.limitAmount],
    );
    id = r.insertId;
  }
  await syncAlerts(ctx.db, ctx.user);
  return { id };
}
export const budgets = (db, user) =>
  rows(
    db,
    `SELECT p.*,limitAmount-used AS available,ROUND(100*used/limitAmount,2) AS percent
  FROM progreso p WHERE userId=? ORDER BY period DESC,categoryName`,
    [user],
  );
export const alerts = (db, user) =>
  rows(
    db,
    `SELECT a.*,p.categoryName,p.period,(p.used*100>=p.limitAmount*a.threshold) AS current
  FROM alertas a JOIN progreso p ON p.id=a.budgetId WHERE p.userId=? ORDER BY a.createdAt DESC,p.id,a.threshold`,
    [user],
  );
// El presupuesto no altera saldos: se elimina junto con sus avisos de umbral.
export async function deleteBudget(ctx, b, id) {
  await own(ctx.db, 'presupuestos', ctx.user, id);
  await rows(ctx.db, 'DELETE FROM alertas WHERE budgetId=?', [id]);
  await rows(ctx.db, 'DELETE FROM presupuestos WHERE userId=? AND id=?', [
    ctx.user,
    id,
  ]);
  return { id, deleted: true };
}
