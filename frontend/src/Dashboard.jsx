import React, { useEffect, useState } from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { api, params, money, day, states } from './api';
import { Field, Tile, Empty, Lines, option } from './components';
export function Dashboard({
  data,
  show,
  go,
  reports = false,
  refresh,
  openDetail,
}) {
  const [range, set] = useState({
    from: day().slice(0, 7) + '-01',
    to: day(),
    accountId: '',
    categoryId: '',
  });
  const [r, save] = useState(null),
    [error, err] = useState('');
  useEffect(() => {
    let ok = true;
    save(null);
    err('');
    api('/reports?' + params(range))
      .then((x) => ok && save(x))
      .catch((e) => ok && err(e.message));
    return () => {
      ok = false;
    };
  }, [range, refresh]);
  const field = (k, v) => set({ ...range, [k]: v });
  const sums = r?.balanceTotal || 0;
  const monthly = data.budgets.filter(
    (b) => b.period.slice(0, 7) === range.to.slice(0, 7),
  );
  const current = data.commitments
    .filter((c) => c.status !== 'paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <>
      <div className="filters">
        <Field
          label="Desde"
          kind="date"
          value={range.from}
          onChange={(v) => field('from', v)}
        />
        <Field
          label="Hasta"
          kind="date"
          value={range.to}
          onChange={(v) => field('to', v)}
        />
        {reports && (
          <>
            <Field
              label="Cuenta"
              choices={data.accounts.map((a) => option(a.id, a.name))}
              required={false}
              value={range.accountId}
              onChange={(v) => field('accountId', v)}
            />
            <Field
              label="Categoría"
              choices={data.categories.map((a) => option(a.id, a.name))}
              required={false}
              value={range.categoryId}
              onChange={(v) => field('categoryId', v)}
            />
          </>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {r && (
        <>
          <div className="tiles">
            <div className="tile mainTile">
              <div className="eyeline">
                Saldo al corte
                <span className="chip">
                  <Wallet size={16} />
                </span>
              </div>
              <strong>{money(sums)}</strong>
              <small>{range.to} · COP</small>
            </div>
            <Tile
              title="Ingresos"
              kind="income"
              value={money(r.totals.income)}
            />
            <Tile
              title="Gastos"
              kind="expense"
              value={money(r.totals.expense)}
            />
            <Tile
              title="Balance del período"
              kind="net"
              value={money(r.totals.net)}
            />
          </div>
          <div className="grid2">
            <section className="panel">
              <h2>
                {reports ? 'Flujos por categoría' : 'Gastos por categoría'}
              </h2>
              <Bars
                rows={r.categories.filter(
                  (c) => reports || c.type === 'expense',
                )}
              />
            </section>
            <section className="panel">
              <h2>Flujos por mes</h2>
              <Bars rows={r.periods} />
            </section>
          </div>
          {reports && (
            <section className="panel">
              <h2>Saldos por cuenta al corte</h2>
              {r.balances.map((a) => (
                <div className="split" key={a.id}>
                  <b>{a.name}</b>
                  {money(a.balance)}
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {!reports && (
        <>
          <section className="panel">
            <div className="sectionhead">
              <h2>Últimos movimientos</h2>
              <button className="link" onClick={() => go('Historial')}>
                Ver historial <ArrowRight size={15} />
              </button>
            </div>
            <Lines items={data.recent.items.slice(0, 5)} open={openDetail} />
          </section>
          <div className="grid2">
            <section className="panel">
              <h2>Presupuestos de {range.to.slice(0, 7)}</h2>
              {monthly.length ? (
                monthly.map((b) => <Progress key={b.id} b={b} />)
              ) : (
                <Empty>Aún no hay presupuestos para este mes.</Empty>
              )}
            </section>
            <section className="panel">
              <h2>Compromisos pendientes</h2>
              {current.slice(0, 4).map((c) => (
                <div className="split" key={c.id}>
                  <b>
                    {c.name}
                    <small>
                      {c.dueDate} · {states[c.status]}
                    </small>
                  </b>
                  {money(c.remaining)}
                </div>
              ))}
              {!current.length && (
                <Empty>Estás al día con tus compromisos.</Empty>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
function Bars({ rows }) {
  const max = Math.max(...rows.map((x) => Number(x.amount)), 1);
  return rows.length ? (
    <div className="bars">
      {rows.map((x, i) => (
        <div key={i}>
          <div className="split">
            <span>
              {x.label}{' '}
              <small className="inline">
                {x.type === 'income' ? 'Ingreso' : 'Gasto'}
              </small>
            </span>
            <b>{money(x.amount)}</b>
          </div>
          <div className="track">
            <i
              className={x.type}
              style={{ width: (100 * Number(x.amount)) / max + '%' }}
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty>El gráfico aparecerá con el primer movimiento del período.</Empty>
  );
}
export function Progress({ b }) {
  const pct = Number(b.percent),
    level = pct >= 100 ? 'expense' : pct >= 80 ? 'warn' : 'income';
  return (
    <div className="progress">
      <div className="split">
        <b>{b.categoryName}</b>
        <span>{b.percent} %</span>
      </div>
      <div className="track">
        <i className={level} style={{ width: Math.min(100, pct) + '%' }} />
      </div>
      <small>
        {money(b.used)} de {money(b.limitAmount)} · Disponible{' '}
        {money(b.available)}
      </small>
    </div>
  );
}
