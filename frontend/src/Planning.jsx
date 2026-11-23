import React, { useState } from 'react';
import { day, money, states, api } from './api';
import { Progress } from './Dashboard';
import {
  Form,
  Field,
  Add,
  Empty,
  MovementForm,
  labelField as f,
  amountField,
  options,
  option,
} from './components';
export function Budgets({ data, dialog, save, act }) {
  const [month, set] = useState(day().slice(0, 7));
  const expenses = data.categories.filter((c) => c.type === 'expense');
  return (
    <>
      <div className="toolbar">
        <Add
          onClick={() =>
            dialog(
              'Nuevo presupuesto',
              <Form
                fields={[
                  f('categoryId', 'Categoría de gasto', {
                    choices: options(expenses),
                  }),
                  f('period', 'Mes', { kind: 'month' }),
                  amountField('limitAmount', 'Límite mensual (COP)'),
                ]}
                initial={{ period: month }}
                submit={(b) => save('/budgets', 'POST', b)}
              />,
            )
          }
        >
          Nuevo presupuesto
        </Add>
        <Field label="Mes" kind="month" value={month} onChange={set} />
      </div>
      <div className="cards">
        {data.budgets
          .filter((b) => b.period.startsWith(month))
          .map((b) => (
            <section key={b.id} className="panel">
              <Progress b={b} />
              <div className="rowActions">
              <button
                className="link"
                onClick={() =>
                  dialog(
                    'Editar presupuesto',
                    <Form
                      fields={[
                        amountField('limitAmount', 'Límite mensual (COP)'),
                      ]}
                      initial={{ limitAmount: b.limitAmount }}
                      submit={(v) => save('/budgets/' + b.id, 'PATCH', v)}
                    />,
                  )
                }
              >
                Editar límite
              </button>
              <button
                className="link danger-link"
                onClick={() => {
                  if (confirm('¿Eliminar el presupuesto de ' + b.categoryName + '?'))
                    act(() => save('/budgets/' + b.id, 'DELETE'));
                }}
              >
                Eliminar
              </button>
              </div>
            </section>
          ))}
      </div>
      {!data.budgets.some((b) => b.period.startsWith(month)) && (
        <Empty>Sin presupuestos para el mes seleccionado.</Empty>
      )}
      <section className="panel">
        <h2>Alertas del mes</h2>
        {data.alerts.budgets
          .filter((a) => a.period.startsWith(month))
          .map((a) => (
            <div className="split" key={a.budgetId + '-' + a.threshold}>
              <span>
                {a.categoryName} · Umbral del {a.threshold} %
              </span>
              <small>{a.current ? 'Vigente' : 'Histórica'}</small>
            </div>
          ))}
        {!data.alerts.budgets.some((a) => a.period.startsWith(month)) && (
          <Empty>Sin umbrales alcanzados.</Empty>
        )}
      </section>
    </>
  );
}
export function Recurring({ data, dialog, save, act, openDetail }) {
  const [tab, set] = useState('Compromisos'),
    [month, monthSet] = useState(''),
    [status, statusSet] = useState('');
  const expenses = data.categories.filter((c) => c.type === 'expense');
  function schedule(s) {
    const fields = [
      f('name', 'Nombre', { maxLength: 90 }),
      f('categoryId', 'Categoría de gasto', {
        choices: options(expenses, s?.categoryId),
      }),
      amountField('estimatedAmount', 'Importe estimado (COP)'),
      f('dueDay', 'Día de vencimiento', { kind: 'number', min: 1, max: 31 }),
      ...(!s ? [f('startDate', 'Fecha de inicio', { kind: 'date' })] : []),
      f('isVariable', 'Importe', {
        choices: [option('0', 'Fijo'), option('1', 'Variable')],
      }),
    ];
    dialog(
      s ? 'Editar programación futura' : 'Nueva programación',
      <Form
        fields={fields}
        initial={
          s
            ? {
                name: s.name,
                categoryId: s.categoryId,
                estimatedAmount: s.estimatedAmount,
                dueDay: s.dueDay,
                isVariable: String(s.isVariable),
              }
            : { startDate: day(), dueDay: 1, isVariable: '0' }
        }
        submit={(b) =>
          save(
            '/recurring-schedules' + (s ? '/' + s.id : ''),
            s ? 'PATCH' : 'POST',
            { ...b, isVariable: b.isVariable === '1' },
          )
        }
      />,
    );
  }
  async function payments(c) {
    const detail = await api('/commitments/' + c.id);
    dialog(
      'Abonos de ' + c.name,
      <>
        <p>
          Vence {c.dueDate} · Pendiente {money(c.remaining)}
        </p>
        {detail.payments.map((m) => (
          <button className="line" key={m.id} onClick={() => openDetail(m)}>
            <b>{money(m.amount)}</b>
            <small>
              {m.date} · {m.voided ? 'Anulado' : 'Ver detalle'}
            </small>
          </button>
        ))}
        {!detail.payments.length && <Empty>Sin abonos registrados.</Empty>}
      </>,
    );
  }
  const list = data.commitments.filter(
    (c) =>
      (!month || c.period.startsWith(month)) &&
      (!status || status === c.status),
  );
  return (
    <>
      <div className="toolbar">
        <Add onClick={() => schedule(null)}>Nueva programación</Add>
        <div className="tabs">
          {['Compromisos', 'Programaciones'].map((v) => (
            <button
              key={v}
              className={v === tab ? 'selected' : ''}
              onClick={() => set(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {tab === 'Programaciones' ? (
        <div className="cards">
          {data.schedules.map((s) => (
            <div className="panel" key={s.id}>
              <small>
                {s.active ? 'Activa' : 'Inactiva'} · Desde {s.startDate}
              </small>
              <h2>{s.name}</h2>
              <p>
                {money(s.estimatedAmount)} · Día {s.dueDay}
              </p>
              <div className="rowActions">
                <button className="link" onClick={() => schedule(s)}>
                  Editar
                </button>
                <button
                  className="link"
                  onClick={() =>
                    act(() =>
                      save('/recurring-schedules/' + s.id, 'PATCH', {
                        active: !s.active,
                      }),
                    )
                  }
                >
                  {s.active ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="filters">
            <Field
              label="Mes de vencimiento"
              required={false}
              kind="month"
              value={month}
              onChange={monthSet}
            />
            <Field
              label="Estado"
              required={false}
              choices={Object.entries(states).map(([k, v]) => option(k, v))}
              value={status}
              onChange={statusSet}
            />
          </div>
          <div className="cards">
            {list.map((c) => (
              <section className="panel" key={c.id}>
                <small>
                  {c.dueDate} ·{' '}
                  <span className={'pill ' + c.status}>{states[c.status]}</span>
                  {c.lateDays
                    ? ' · ' + c.lateDays + ' días de atraso'
                    : c.reminder
                      ? ' · Próximo a vencer'
                      : ''}
                </small>
                <h2>{c.name}</h2>
                <strong className="balance">{money(c.remaining)}</strong>
                <small>Pendiente de {money(c.expected)}</small>
                <div className="rowActions">
                  {c.status !== 'paid' && (
                    <button
                      className="link"
                      onClick={() =>
                        dialog(
                          'Registrar abono',
                          <MovementForm
                            data={data}
                            payment
                            initial={{
                              amount: c.remaining,
                              description: c.name,
                            }}
                            button="Confirmar abono"
                            submit={(b) =>
                              save(
                                '/commitments/' + c.id + '/payments',
                                'POST',
                                b,
                              )
                            }
                          />,
                        )
                      }
                    >
                      Abonar
                    </button>
                  )}
                  {!!c.isVariable && !c.hasPayments && (
                    <button
                      className="link"
                      onClick={() =>
                        dialog(
                          'Ajustar importe del compromiso',
                          <Form
                            fields={[amountField()]}
                            initial={{ amount: c.expected }}
                            submit={(b) =>
                              save(
                                '/commitments/' + c.id + '/amount',
                                'PATCH',
                                b,
                              )
                            }
                          />,
                        )
                      }
                    >
                      Ajustar importe
                    </button>
                  )}
                  <button
                    className="link"
                    onClick={() => act(() => payments(c))}
                  >
                    Ver abonos
                  </button>
                </div>
              </section>
            ))}
          </div>
          {!list.length && <Empty>Sin compromisos para esta selección.</Empty>}
        </>
      )}
    </>
  );
}
