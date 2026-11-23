import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { fixture } from './fixture.js';
import { interpret } from '../src/modules/chat.js';
import { today, cents, decimal, positive } from '../src/core/validation.js';
import { dueDate } from '../src/modules/recurring.js';
test('Intérprete colombiano y ambigüedades', () => {
  for (const [s, amount, type] of [
    ['Me gasté 15 mil en transporte', '15000.00', 'expense'],
    ['Compré un almuerzo de 20 lucas', '20000.00', 'expense'],
    ['Me consignaron 200 mil del trabajo', '200000.00', 'income'],
    ['Recibí 20.000', '20000.00', 'income'],
    ['Gasté 1,5 mil', '1500.00', 'expense'],
  ]) {
    const p = interpret(s);
    assert.equal(p.amount, amount);
    assert.equal(p.type, type);
    assert.equal(p.accountId, null);
  }
  assert.equal(interpret('Pagué entre 20 y 30 mil').amount, null);
  assert.throws(() => interpret('¿Cuánto tengo en mi cuenta?'));
  assert.equal(dueDate('2024-02-01', 31), '2024-02-29');
  assert.equal(dueDate('2025-02-01', 31), '2025-02-28');
  assert.equal(decimal(cents('9999999999999.99')), '9999999999999.99');
  // Un importe sin formato es un error de validación, no una excepción.
  for (const bad of ['abc', '1,5', '', '-5', '0'])
    assert.equal(positive.safeParse(bad).success, false, bad);
  assert.equal(positive.safeParse('15000.50').success, true);
});
test('Integración HTTP, Socket.IO y MySQL', { timeout: 150000 }, async (t) => {
  // Imports of pure helpers may have initialized a pool. Select the isolated schema before the process starts (test runner).
  assert.match(process.env.DB_NAME || '', /_test$/);
  const sys = await fixture();
  t.after(sys.close);
  const { pool } = sys;
  let u,
    v,
    bank,
    cash,
    food,
    salary,
    food2,
    budgetId,
    m1,
    trans,
    commit,
    pay1,
    sid,
    outsider;
  const date = today(),
    period = date.slice(0, 7);
  const entry = (amount, more = {}) => ({
    type: 'expense',
    amount,
    accountId: bank,
    categoryId: food,
    date,
    description: 'Prueba',
    ...more,
  });
  const balances = async () =>
    Object.fromEntries((await u.ok('/accounts')).map((x) => [x.id, x.balance]));
  await t.test(
    'Registro, login, hash Argon2id, perfil, token CSRF, sesión y origen',
    async () => {
      assert.equal((await sys.client().req('/accounts')).status, 401);
      u = await sys.person();
      v = await sys.person('Otro perfil');
      assert.equal(
        (
          await u.req('/auth/register', 'POST', {
            ...u.credentials,
            name: 'Otro',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await sys
            .client()
            .req('/auth/login', 'POST', {
              ...u.credentials,
              password: 'incorrecta',
            })
        ).status,
        401,
      );
      const [[row]] = await pool.execute(
        'SELECT passwordHash FROM usuarios WHERE id=?',
        [u.id],
      );
      assert.match(row.passwordHash, /^\$argon2id\$/);
      assert.equal(
        (
          await u.req(
            '/users/me',
            'PATCH',
            { name: 'Lina', email: u.credentials.email },
            undefined,
            { 'X-CSRF-Token': 'otro' },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await u.req('/accounts', 'GET', undefined, undefined, {
            Origin: 'https://example.invalid',
          })
        ).status,
        403,
      );
      await u.ok('/users/me', 'PATCH', {
        name: 'Lina',
        email: u.credentials.email,
      });
      assert.equal((await u.ok('/users/me')).name, 'Lina');
    },
  );
  await t.test(
    'Cuentas, ajustes, categorías propias y desactivación con historial',
    async () => {
      bank = (
        await u.ok('/accounts', 'POST', {
          name: 'Banco',
          openingBalance: '100000.10',
          date,
        })
      ).id;
      cash = (
        await u.ok('/accounts', 'POST', {
          name: 'Efectivo',
          openingBalance: '20000',
          date,
        })
      ).id;
      outsider = (
        await v.ok('/accounts', 'POST', {
          name: 'Privada',
          openingBalance: '500',
          date,
        })
      ).id;
      await u.ok('/accounts/' + bank, 'PATCH', { name: 'Bancolombia' });
      const cat = await u.ok('/categories');
      food = cat.find((c) => c.name === 'Alimentación').id;
      salary = cat.find((c) => c.name === 'Salario').id;
      food2 = (
        await u.ok('/categories', 'POST', {
          name: 'Meriendas',
          type: 'expense',
        })
      ).id;
      await u.ok('/categories/' + food2, 'PATCH', { name: 'Cafetería' });
      await u.ok('/accounts/' + bank + '/adjustments', 'POST', {
        amount: '-0.10',
        description: 'Conciliación',
        date,
      });
      assert.equal((await balances())[bank], '100000.00');
      await u.ok('/accounts/' + cash, 'PATCH', { active: false });
      assert.equal(
        (await u.req('/transactions', 'POST', entry('1', { accountId: cash })))
          .status,
        422,
      );
      await u.ok('/accounts/' + cash, 'PATCH', { active: true });
    },
  );
  await t.test('Aislamiento de cuentas, categorías y movimientos', async () => {
    assert.equal(
      (await u.req('/accounts/' + outsider, 'PATCH', { name: 'Cambio' }))
        .status,
      404,
    );
    assert.equal(
      (await v.req('/transactions', 'POST', entry('10'))).status,
      404,
    );
    assert.equal(
      (await v.req('/categories/' + food2, 'PATCH', { active: false })).status,
      404,
    );
    assert.equal(
      (await u.req('/transactions', 'POST', entry('0'))).status,
      400,
    );
    assert.equal(
      (await u.req('/transactions', 'POST', entry('1', { categoryId: salary })))
        .status,
      422,
    );
  });
  await t.test(
    'Presupuesto único por mes y categoría, cruces de 80 % y 100 %',
    async () => {
      const b = { categoryId: food, period, limitAmount: '1000' };
      budgetId = (await u.ok('/budgets', 'POST', b)).id;
      assert.equal((await u.req('/budgets', 'POST', b)).status, 409);
      m1 = await u.ok('/transactions', 'POST', entry('1200'));
      const a = await u.ok('/alerts');
      assert.deepEqual(
        a.budgets.map((x) => x.threshold),
        [80, 100],
      );
      const [p] = await u.ok('/budgets');
      assert.equal(p.available, '-200.00');
      await u.ok(
        '/transactions',
        'POST',
        entry('2000', { type: 'income', categoryId: salary }),
      );
      assert.equal((await balances())[bank], '100800.00');
    },
  );
  await t.test(
    'Transferencia atómica, idempotencia concurrente y exclusión en reportes',
    async () => {
      const b = {
          sourceAccountId: bank,
          destinationAccountId: cash,
          amount: '20000',
          date,
        },
        key = randomUUID();
      const [a, r] = await Promise.all([
        u.ok('/transfers', 'POST', b, key),
        u.ok('/transfers', 'POST', b, key),
      ]);
      assert.equal(a.id, r.id);
      trans = a;
      assert.equal(
        (await u.req('/transfers', 'POST', { ...b, amount: '3000' }, key))
          .status,
        409,
      );
      assert.equal(
        (
          await u.req('/transfers', 'POST', {
            ...b,
            destinationAccountId: outsider,
          })
        ).status,
        404,
      );
      assert.deepEqual(await balances(), {
        [bank]: '80800.00',
        [cash]: '40000.00',
      });
      const rep = await u.ok('/reports?from=' + date + '&to=' + date);
      assert.equal(rep.totals.net, '800.00');
      assert.equal(rep.totals.expense, '1200.00');
    },
  );
  await t.test(
    'Saldo insuficiente: se rechaza sin cambios y el reintento funciona con fondos',
    async () => {
      const b = entry('90000'),
        key = randomUUID(),
        res = await u.req('/transactions', 'POST', b, key);
      assert.equal(res.status, 422);
      assert.equal(res.error.code, 'INSUFFICIENT_FUNDS');
      assert.equal(res.error.details.currentBalance, '80800.00');
      assert.equal(res.error.details.resultingBalance, '-9200.00');
      assert.match(res.error.message, /Bancolombia/);
      assert.equal((await balances())[bank], '80800.00');
      // Transferencias, ajustes negativos y saldos iniciales negativos también se rechazan.
      assert.equal(
        (
          await u.req('/transfers', 'POST', {
            sourceAccountId: bank,
            destinationAccountId: cash,
            amount: '999999',
            date,
          })
        ).status,
        422,
      );
      assert.equal(
        (
          await u.req('/accounts/' + bank + '/adjustments', 'POST', {
            amount: '-999999',
            description: 'Prueba',
            date,
          })
        ).status,
        422,
      );
      const negative = await u.req('/accounts', 'POST', {
        name: 'Negativa',
        openingBalance: '-1',
        date,
      });
      assert.equal(negative.status, 422);
      assert.equal(negative.error.code, 'NEGATIVE_OPENING');
      assert.equal(
        (await u.ok('/accounts')).some((a) => a.name === 'Negativa'),
        false,
      );
      // Llevar la cuenta exactamente a cero sí es válido, con la misma clave del intento fallido.
      await u.ok(
        '/transactions',
        'POST',
        entry('9200', { type: 'income', categoryId: salary }),
      );
      const item = await u.ok('/transactions', 'POST', b, key);
      assert.equal((await balances())[bank], '0.00');
      assert.equal((await u.ok('/transactions', 'POST', b, key)).id, item.id);
      await u.ok('/transactions/' + item.id + '/void', 'POST', {
        version: item.version,
      });
      assert.equal((await balances())[bank], '90000.00');
    },
  );
  await t.test(
    'Corrección, versión obsoleta, anulación, alertas y auditoría',
    async () => {
      const edited = await u.ok('/transactions/' + m1.id, 'PUT', {
        ...entry('750', { accountId: cash, categoryId: food2 }),
        version: m1.version,
      });
      assert.equal(
        (
          await u.req('/transactions/' + m1.id + '/void', 'POST', {
            version: m1.version,
          })
        ).status,
        409,
      );
      assert.equal((await u.ok('/budgets'))[0].used, '0.00');
      assert.ok((await u.ok('/alerts')).budgets.every((a) => !a.current));
      await u.ok('/transactions/' + m1.id + '/void', 'POST', {
        version: edited.version,
      });
      const d = await u.ok('/transactions/' + m1.id);
      assert.equal(d.audit.length, 3);
      assert.equal(d.voided, 1);
      await u.ok('/transfers/' + trans.id + '/void', 'POST', { version: 1 });
      assert.equal((await balances())[cash], '20000.00');
      assert.equal((await v.req('/transactions/' + m1.id)).status, 404);
      const h = await u.ok(
        '/transactions?from=' +
          date +
          '&to=' +
          date +
          '&type=expense&accountId=' +
          cash +
          '&categoryId=' +
          food2,
      );
      assert.equal(h.total, 1);
    },
  );
  await t.test(
    'Generación mensual, recuperación al login, vencimientos y repetición',
    async () => {
      const prev = new Date(date + 'T12:00:00Z');
      prev.setUTCDate(1);
      prev.setUTCMonth(prev.getUTCMonth() - 2);
      const startDate = prev.toISOString().slice(0, 10);
      sid = (
        await u.ok('/recurring-schedules', 'POST', {
          name: 'Internet',
          categoryId: food,
          estimatedAmount: '1000',
          dueDay: 31,
          startDate,
          isVariable: true,
        })
      ).id;
      const all = await u.ok('/commitments');
      assert.equal(all.length, 3);
      assert.equal(all[0].status, 'pending');
      assert.equal(all[2].dueDate, dueDate(startDate, 31));
      assert.ok(all[2].lateDays > 0);
      // Simulate an offline interval using only this test user's unpaid fixtures.
      await pool.execute(
        'DELETE FROM compromisos WHERE scheduleId=? AND period>=?',
        [sid, startDate],
      );
      await pool.execute(
        'UPDATE programaciones_recurrentes SET nextMonth=? WHERE id=?',
        [startDate, sid],
      );
      await u.ok('/auth/login', 'POST', u.credentials);
      await u.ok('/auth/login', 'POST', u.credentials);
      const restored = await u.ok('/commitments');
      assert.equal(restored.length, 3);
      commit = restored.at(-1);
      assert.equal((await u.ok('/budgets'))[0].used, '0.00');
      await u.ok('/recurring-schedules/' + sid, 'PATCH', {
        estimatedAmount: '1234',
        active: false,
      });
      assert.equal((await u.ok('/commitments')).at(-1).expected, '1000.00');
    },
  );
  await t.test(
    'Ajuste variable, abonos parciales, total, corrección y anulación',
    async () => {
      await u.ok('/commitments/' + commit.id + '/amount', 'PATCH', {
        amount: '1200',
      });
      const b = { accountId: bank, amount: '400', date };
      pay1 = await u.ok('/commitments/' + commit.id + '/payments', 'POST', b);
      const c = () => u.ok('/commitments/' + commit.id);
      assert.equal((await c()).status, 'partial');
      assert.equal(
        (
          await u.req('/commitments/' + commit.id + '/amount', 'PATCH', {
            amount: '2100',
          })
        ).status,
        422,
      );
      assert.equal(
        (
          await v.req('/commitments/' + commit.id + '/payments', 'POST', {
            ...b,
            accountId: outsider,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await u.req('/commitments/' + commit.id + '/payments', 'POST', {
            ...b,
            amount: '801',
          })
        ).status,
        422,
      );
      const second = await u.ok(
        '/commitments/' + commit.id + '/payments',
        'POST',
        { ...b, amount: '800' },
      );
      assert.equal((await c()).status, 'paid');
      await u.ok('/payments/' + pay1.id, 'PUT', {
        ...b,
        amount: '200',
        version: 1,
      });
      assert.equal((await c()).remaining, '200.00');
      await u.ok('/payments/' + second.id + '/void', 'POST', { version: 1 });
      assert.equal((await c()).remaining, '1000.00');
      assert.ok((await c()).lateDays > 0);
      assert.equal((await u.ok('/budgets'))[0].used, '200.00');
      assert.equal(
        (
          await u.req('/transactions/' + pay1.id + '/void', 'POST', {
            version: 2,
          })
        ).status,
        422,
      );
    },
  );
  await t.test(
    'Recordatorio en la ventana de tres días y supresión al pagar',
    async () => {
      const choose = (offset) => {
        const d = new Date(date + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      };
      await pool.execute('UPDATE compromisos SET dueDate=? WHERE id=?', [
        choose(4),
        commit.id,
      ]);
      assert.ok(
        !(await u.ok('/alerts')).reminders.some((c) => c.id === commit.id),
      );
      await pool.execute('UPDATE compromisos SET dueDate=? WHERE id=?', [
        choose(3),
        commit.id,
      ]);
      assert.equal(
        (await u.ok('/alerts')).reminders.filter((c) => c.id === commit.id)
          .length,
        1,
      );
      const p = await u.ok('/commitments/' + commit.id + '/payments', 'POST', {
        accountId: bank,
        amount: '1000',
        date,
      });
      assert.ok(
        !(await u.ok('/alerts')).reminders.some((c) => c.id === commit.id),
      );
      await u.ok('/payments/' + p.id + '/void', 'POST', { version: 1 });
    },
  );
  await t.test(
    'Débitos simultáneos, umbral exacto y rollback integral',
    async () => {
      const acct = (
        await u.ok('/accounts', 'POST', {
          name: 'Concurrencia',
          openingBalance: '100',
          date,
        })
      ).id;
      const b = entry('80', { accountId: acct, categoryId: food2 });
      await u.ok('/budgets', 'POST', {
        categoryId: food2,
        period,
        limitAmount: '100',
      });
      const attempts = await Promise.all([
        u.req('/transactions', 'POST', b),
        u.req('/transactions', 'POST', b),
      ]);
      assert.deepEqual(attempts.map((a) => a.status).sort(), [201, 422]);
      assert.equal((await balances())[acct], '20.00');
      assert.ok(
        (await u.ok('/alerts')).budgets.some(
          (a) => a.categoryName === 'Cafetería' && a.threshold === 80,
        ),
      );
      const { transaction } = await import('../src/config/db.js');
      await assert.rejects(
        transaction(async (db) => {
          await db.execute('UPDATE movimientos SET amount=1 WHERE id=?', [
            attempts.find((a) => a.status === 201).data.id,
          ]);
          throw Error('Fallo de prueba después de la escritura');
        }),
      );
      assert.equal((await balances())[acct], '20.00');
      await u.ok(
        '/transactions/' +
          attempts.find((a) => a.status === 201).data.id +
          '/void',
        'POST',
        { version: 1 },
      );
    },
  );
  await t.test(
    'DELETE: elimina lo que no tiene historial y protege lo que está en uso',
    async () => {
      // Cuenta sin movimientos propios: se elimina con su saldo de apertura.
      const temp = (
        await u.ok('/accounts', 'POST', {
          name: 'Temporal',
          openingBalance: '0',
          date,
        })
      ).id;
      assert.deepEqual(await u.ok('/accounts/' + temp, 'DELETE'), {
        id: temp,
        deleted: true,
      });
      assert.ok(!(await u.ok('/accounts')).some((a) => a.id === temp));
      assert.equal((await u.req('/accounts/' + temp, 'DELETE')).status, 404);
      // Cuenta con movimientos: 409 y se conserva.
      const used = await u.req('/accounts/' + bank, 'DELETE');
      assert.equal(used.status, 409);
      assert.equal(used.error.code, 'IN_USE');
      // Presupuesto: se elimina con sus alertas; otro perfil no puede tocarlo.
      const cat = (
        await u.ok('/categories', 'POST', { name: 'Borrable', type: 'expense' })
      ).id;
      const bid = (
        await u.ok('/budgets', 'POST', {
          categoryId: cat,
          period,
          limitAmount: '500',
        })
      ).id;
      assert.equal((await u.req('/categories/' + cat, 'DELETE')).status, 409);
      assert.equal((await v.req('/budgets/' + bid, 'DELETE')).status, 404);
      await u.ok('/budgets/' + bid, 'DELETE');
      assert.ok(!(await u.ok('/budgets')).some((b) => b.id === bid));
      // Categoría ya sin uso: se elimina. Una categoría con movimientos, no.
      await u.ok('/categories/' + cat, 'DELETE');
      assert.ok(!(await u.ok('/categories')).some((c) => c.id === cat));
      assert.equal((await u.req('/categories/' + food, 'DELETE')).status, 409);
    },
  );
  await t.test(
    'Chat autenticado, propuesta editable, un solo guardado por REST y logout',
    async () => {
      const socket = io(sys.origin, {
        transports: ['websocket'],
        extraHeaders: { Cookie: u.cookie },
        auth: { csrf: u.csrf },
        reconnection: false,
      });
      t.after(() => socket.disconnect());
      await once(socket, 'connect');
      const before = await balances(),
        got = once(socket, 'chat:proposal');
      socket.emit('chat:interpret', {
        requestId: 'demo',
        text: 'Compré un almuerzo de 20 lucas',
      });
      const [proposal] = await got;
      assert.equal(proposal.amount, '20000.00');
      assert.equal(proposal.categoryId, food);
      assert.equal(proposal.accountId, null);
      assert.deepEqual(await balances(), before);
      const body = { ...proposal, accountId: bank, amount: '500' },
        key = randomUUID();
      const a = await u.ok('/transactions', 'POST', body, key);
      assert.equal((await u.ok('/transactions', 'POST', body, key)).id, a.id);
      assert.equal((await u.ok('/reports')).totals.expense, '700.00');
      const closed = once(socket, 'disconnect');
      await u.ok('/auth/logout', 'POST', {});
      await closed;
      assert.equal((await u.req('/accounts')).status, 401);
    },
  );
});
