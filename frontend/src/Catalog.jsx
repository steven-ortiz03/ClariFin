import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { day, money, types } from './api';
import {
  Form,
  Add,
  Empty,
  labelField as field,
  amountField,
  dateField,
  fundsHint,
  hue,
  option,
  options,
} from './components';
export function Catalog({ mode, data, dialog, save, act }) {
  const account = mode === 'Cuentas',
    key = account ? 'accounts' : 'categories',
    items = data[key];
  const [inactive, set] = useState(false);
  const openForm = (title, fields, initial, submit, hint) =>
    dialog(
      title,
      <Form fields={fields} initial={initial} submit={submit} hint={hint} />,
    );
  function create() {
    const fields = [
      field('name', 'Nombre', { maxLength: 90 }),
      ...(account
        ? [amountField('openingBalance', 'Saldo inicial (COP)'), dateField()]
        : [
            field('type', 'Tipo', {
              choices: [
                option('income', 'Ingreso'),
                option('expense', 'Gasto'),
              ],
            }),
          ]),
    ];
    openForm(
      account ? 'Nueva cuenta' : 'Nueva categoría',
      fields,
      account ? { openingBalance: '0.00', date: day() } : { type: 'expense' },
      (b) => save('/' + key, 'POST', b),
    );
  }
  function transfer() {
    openForm(
      'Transferir entre cuentas',
      [
        field('sourceAccountId', 'Cuenta de origen', {
          choices: options(data.accounts),
        }),
        field('destinationAccountId', 'Cuenta de destino', {
          choices: options(data.accounts),
        }),
        amountField(),
        dateField(),
        field('description', 'Descripción', {
          required: false,
          maxLength: 240,
        }),
      ],
      { date: day(), description: '' },
      (b) => save('/transfers', 'POST', b),
      (b) =>
        b.sourceAccountId
          ? b.sourceAccountId === b.destinationAccountId
            ? { bad: true, text: 'Elige dos cuentas distintas.' }
            : fundsHint(data.accounts, b.sourceAccountId, b.amount)
          : null,
    );
  }
  return (
    <>
      <div className="toolbar">
        <Add onClick={create}>
          {account ? 'Nueva cuenta' : 'Nueva categoría'}
        </Add>
        {account && (
          <button className="secondary" onClick={transfer}>
            <ArrowLeftRight size={16} />
            Transferir
          </button>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={inactive}
            onChange={(e) => set(e.target.checked)}
          />
          Mostrar inactivas
        </label>
      </div>
      <div className="cards">
        {items
          .filter((x) => inactive || x.active)
          .map((x) => (
            <article className={'panel' + (x.active ? '' : ' off')} key={x.id}>
              <div className="acct-top">
                {account && (
                  <span
                    className="acct-ico"
                    aria-hidden="true"
                    style={{ '--hue': hue(x.id) }}
                  >
                    {x.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <small>
                  {account
                    ? 'Cuenta financiera'
                    : types[x.type] +
                      (x.preset ? ' · Predeterminada' : ' · Personal')}
                  {!x.active ? ' · Inactiva' : ''}
                </small>
              </div>
              <h2>{x.name}</h2>
              {account && (
                <strong className="balance">{money(x.balance)}</strong>
              )}
              <div className="rowActions">
                <button
                  className="link"
                  onClick={() =>
                    openForm(
                      'Editar nombre',
                      [field('name', 'Nombre', { maxLength: 90 })],
                      { name: x.name },
                      (b) => save('/' + key + '/' + x.id, 'PATCH', b),
                    )
                  }
                >
                  Editar
                </button>
                {account && !!x.active && (
                  <button
                    className="link"
                    onClick={() =>
                      openForm(
                        'Ajustar saldo',
                        [
                          amountField(
                            'amount',
                            'Cambio de saldo (+ o − COP)',
                            true,
                          ),
                          dateField(),
                          field('description', 'Motivo', { maxLength: 240 }),
                        ],
                        { date: day() },
                        (b) =>
                          save('/accounts/' + x.id + '/adjustments', 'POST', b),
                        (b) =>
                          Number(b.amount) < 0
                            ? fundsHint(data.accounts, x.id, -Number(b.amount))
                            : null,
                      )
                    }
                  >
                    Ajustar saldo
                  </button>
                )}
                <button
                  className="link"
                  onClick={() =>
                    act(() =>
                      save('/' + key + '/' + x.id, 'PATCH', {
                        active: !x.active,
                      }),
                    )
                  }
                >
                  {x.active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  className="link danger-link"
                  onClick={() => {
                    if (
                      confirm(
                        '¿Eliminar «' +
                          x.name +
                          '»? Solo es posible si no tiene historial; si lo tiene, desactívala.',
                      )
                    )
                      act(() => save('/' + key + '/' + x.id, 'DELETE'));
                  }}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
      </div>
      {!items.length && (
        <Empty>Crea una cuenta para registrar tu primer movimiento.</Empty>
      )}
    </>
  );
}
