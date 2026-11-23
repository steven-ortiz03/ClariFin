import { Router } from 'express';
import { z } from 'zod';
import { authRoutes } from './modules/auth.js';
import { rows } from './config/db.js';

import { read, mutation as change } from './core/controllers.js';
import {
  id,
  type,
  name,
  description,
  positive,
  money,
  period,
  movement,
  transfer,
  payment,
  schedule,
  version,
  effectiveDay,
  requireThat,
} from './core/validation.js';
import {
  createAccount,
  createCategory,
  editCatalog,
  deleteAccount,
  deleteCategory,
} from './modules/catalog.js';
import { history, accounts, report } from './modules/reports.js';
import { saveEntry, changeMovement, detail, pay } from './modules/ledger.js';
import { budgets, alerts, budget, deleteBudget } from './modules/budgets.js';
import {
  createSchedule,
  editSchedule,
  commitments,
  changeExpected,
} from './modules/recurring.js';
const nothing = z.object({});
const edit = z
  .object({ name: name.optional(), active: z.boolean().optional() })
  .refine((b) => Object.keys(b).length, 'Indica un cambio.');
export function routes() {
  const r = Router();
  authRoutes(r);
  r.get(
    '/accounts',
    read((db, u) => accounts(db, u)),
  );
  r.post(
    '/accounts',
    change(
      z.object({ name, openingBalance: money, date: effectiveDay }),
      createAccount,
      201,
    ),
  );
  r.patch(
    '/accounts/:id',
    change(edit, (ctx, b, id) => editCatalog(ctx, 'cuentas', id, b)),
  );
  r.delete('/accounts/:id', change(nothing, deleteAccount));
  r.post(
    '/accounts/:id/adjustments',
    change(
      z.object({
        amount: money.refine((s) => Number(s) !== 0),
        description: description.refine(Boolean),
        date: effectiveDay,
      }),
      (ctx, b, id) =>
        saveEntry(ctx, { ...b, type: 'adjustment', accountId: id }),
      201,
    ),
  );
  r.get(
    '/categories',
    read((db, u) =>
      rows(db, 'SELECT * FROM categorias WHERE userId=? ORDER BY type,name', [
        u,
      ]),
    ),
  );
  r.post('/categories', change(z.object({ name, type }), createCategory, 201));
  r.patch(
    '/categories/:id',
    change(edit, (ctx, b, id) => editCatalog(ctx, 'categorias', id, b)),
  );
  r.delete('/categories/:id', change(nothing, deleteCategory));
  r.get(
    '/transactions',
    read((db, u, req) => history(db, u, req.query)),
  );
  r.get(
    '/transactions/:id',
    read((db, u, req) => detail(db, u, id.parse(req.params.id))),
  );
  r.post(
    '/transactions',
    change(movement, (ctx, b) => saveEntry(ctx, b), 201),
  );
  r.post(
    '/transfers',
    change(
      transfer,
      (ctx, b) =>
        saveEntry(ctx, {
          ...b,
          type: 'transfer',
          accountId: b.sourceAccountId,
          destinationId: b.destinationAccountId,
        }),
      201,
    ),
  );
  for (const [path, kind] of [
    ['transactions', 'movement'],
    ['transfers', 'transfer'],
    ['payments', 'payment'],
  ]) {
    r.post(
      '/' + path + '/:id/void',
      change(version, (ctx, b, id) => changeMovement(ctx, id, b, kind, true)),
    );
    if (kind !== 'transfer')
      r.put(
        '/' + path + '/:id',
        change(
          (kind === 'payment' ? payment : movement).merge(version),
          (ctx, b, id) => changeMovement(ctx, id, b, kind),
        ),
      );
  }
  r.get('/budgets', read(budgets));
  r.post(
    '/budgets',
    change(
      z.object({ categoryId: id, period, limitAmount: positive }),
      budget,
      201,
    ),
  );
  r.patch('/budgets/:id', change(z.object({ limitAmount: positive }), budget));
  r.delete('/budgets/:id', change(nothing, deleteBudget));
  r.get(
    '/alerts',
    read(async (db, u) => ({
      budgets: await alerts(db, u),
      reminders: (await commitments(db, u)).filter((c) => c.reminder),
    })),
  );
  r.get(
    '/recurring-schedules',
    read((db, u) =>
      rows(
        db,
        'SELECT * FROM programaciones_recurrentes WHERE userId=? ORDER BY id DESC',
        [u],
      ),
    ),
  );
  r.post('/recurring-schedules', change(schedule, createSchedule, 201));
  r.patch(
    '/recurring-schedules/:id',
    change(
      schedule
        .omit({ startDate: true })
        .partial()
        .extend({ active: z.boolean().optional() }),
      (ctx, b, id) => editSchedule(ctx, id, b),
    ),
  );
  r.get(
    '/commitments',
    read(async (db, u, req) =>
      (await commitments(db, u)).filter(
        (c) =>
          (!req.query.period ||
            c.period.startsWith(period.parse(req.query.period))) &&
          (!req.query.status || c.status === req.query.status),
      ),
    ),
  );
  r.get(
    '/commitments/:id',
    read(async (db, u, req) => {
      const key = id.parse(req.params.id),
        c = (await commitments(db, u)).find((x) => x.id === key);
      requireThat(c, 404, 'NOT_FOUND', 'Compromiso no disponible.');
      return {
        ...c,
        payments: await rows(
          db,
          'SELECT * FROM movimientos WHERE userId=? AND commitmentId=? ORDER BY date,id',
          [u, key],
        ),
        audit: await rows(
          db,
          'SELECT action,previousValue,newValue,createdAt FROM auditoria_movimientos WHERE userId=? AND commitmentId=? ORDER BY id',
          [u, key],
        ),
      };
    }),
  );
  r.patch(
    '/commitments/:id/amount',
    change(z.object({ amount: positive }), (ctx, b, id) =>
      changeExpected(ctx, id, b),
    ),
  );
  r.post(
    '/commitments/:id/payments',
    change(payment, (ctx, b, id) => pay(ctx, id, b), 201),
  );
  r.get(
    '/reports',
    read((db, u, req) => report(db, u, req.query)),
  );
  return r;
}
