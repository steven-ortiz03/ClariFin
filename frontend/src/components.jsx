import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { day, money, types } from './api';
export function Brand() {
  return (
    <div className="brand">
      <span className="brandmark">
        <BookOpen size={22} />
      </span>
      <span>Gestión financiera</span>
    </div>
  );
}
export function Modal({ title, children, close }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label="Cerrar" onClick={close}>
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export const option = (value, label) => ({ value: String(value), label });
export const options = (items, selected) =>
  items
    .filter((x) => x.active || String(x.id) === String(selected))
    .map((x) => option(x.id, x.name));
// Color estable por cuenta para el avatar.
export const hue = (id) =>
  ['#2f8f6b', '#c07d1b', '#3b7ea1', '#8a5a9c', '#b24a2f', '#4f7f3a'][
    Number(id) % 6
  ];
export function Field({
  label,
  kind = 'text',
  choices,
  value,
  onChange,
  required = true,
  ...props
}) {
  const input = {
    'aria-label': label,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    required,
    ...props,
  };
  return (
    <label>
      {label}
      {choices ? (
        <select {...input}>
          <option value="">
            {required ? 'Selecciona…' : 'Todas las opciones'}
          </option>
          {choices.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
      ) : (
        <input type={kind} {...input} />
      )}
    </label>
  );
}
export function Form({
  fields,
  initial = {},
  submit,
  button = 'Guardar',
  cancel,
  hint,
}) {
  const [data, set] = useState(initial),
    [error, err] = useState(''),
    [busy, wait] = useState(false);
  const lock = useRef(false);
  const note = hint?.(data);
  async function send(e) {
    e.preventDefault();
    if (lock.current || note?.bad) return;
    lock.current = true;
    wait(true);
    err('');
    try {
      await submit(data);
    } catch (e) {
      err(e.message);
    } finally {
      lock.current = false;
      wait(false);
    }
  }
  return (
    <form onSubmit={send}>
      {fields.map(({ key, reset, choices, ...f }) => (
        <Field
          key={key}
          {...f}
          choices={typeof choices === 'function' ? choices(data) : choices}
          value={data[key]}
          onChange={(v) =>
            set((old) => ({
              ...old,
              [key]: v,
              ...(reset ? { [reset]: '' } : {}),
            }))
          }
        />
      ))}
      {note && (
        <p className={'hint' + (note.bad ? ' bad' : '')} role="status">
          {note.text}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        {cancel && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={cancel}
          >
            Cancelar
          </button>
        )}
        <button disabled={busy || !!note?.bad}>
          {busy ? 'Guardando…' : button}
        </button>
      </div>
    </form>
  );
}
export const labelField = (key, label, props = {}) => ({
  key,
  label,
  ...props,
});
export const amountField = (
  key = 'amount',
  label = 'Importe (COP)',
  signed = false,
) =>
  labelField(key, label, {
    inputMode: 'decimal',
    pattern: (signed ? '-?' : '') + '[0-9]{1,13}([.][0-9]{1,2})?',
    title: 'Pesos sin separadores de miles. Se admite punto decimal.',
    placeholder: '0.00',
  });
export const dateField = () =>
  labelField('date', 'Fecha', { kind: 'date', max: day() });
// Avisa antes de enviar cuando un gasto o traslado supera el saldo disponible.
export const fundsHint = (accounts, accountId, amount, back = 0) => {
  const a = accounts.find((x) => String(x.id) === String(accountId));
  if (!a) return null;
  const available = Number(a.balance) + back;
  if (Number(amount) > available)
    return {
      bad: true,
      text:
        'Saldo insuficiente en «' + a.name + '»: disponible ' + money(available) + '.',
    };
  return { text: 'Disponible en «' + a.name + '»: ' + money(available) };
};
export function MovementForm({
  data,
  initial = {},
  submit,
  cancel,
  button,
  payment = false,
}) {
  const fields = [
    ...(!payment
      ? [
          labelField('type', 'Tipo', {
            choices: [option('expense', 'Gasto'), option('income', 'Ingreso')],
            reset: 'categoryId',
          }),
        ]
      : []),
    amountField(),
    labelField('accountId', 'Cuenta', {
      choices: options(data.accounts, initial.accountId),
    }),
    ...(!payment
      ? [
          labelField('categoryId', 'Categoría', {
            choices: (b) =>
              options(
                data.categories.filter((c) => c.type === b.type),
                initial.categoryId,
              ),
          }),
        ]
      : []),
    dateField(),
    labelField('description', 'Descripción', {
      required: false,
      maxLength: 240,
    }),
  ];
  const hint = (b) => {
    if ((payment ? 'expense' : b.type) !== 'expense' || !b.accountId)
      return null;
    const back =
      initial.id &&
      initial.type === 'expense' &&
      !initial.voided &&
      String(initial.accountId) === String(b.accountId)
        ? Number(initial.amount)
        : 0;
    return fundsHint(data.accounts, b.accountId, b.amount, back);
  };
  return (
    <Form
      fields={fields}
      initial={{ type: 'expense', date: day(), description: '', ...initial }}
      submit={submit}
      cancel={cancel}
      button={button}
      hint={hint}
    />
  );
}
export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}
export function Tile({ title, value, kind }) {
  const Icon =
    kind === 'income'
      ? ArrowDownLeft
      : kind === 'expense'
        ? ArrowUpRight
        : ArrowLeftRight;
  return (
    <div className={'tile ' + kind}>
      <div className="eyeline">
        {title}
        <span className="chip">
          <Icon size={16} />
        </span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
export function Lines({ items, open }) {
  return items.length ? (
    <div className="lines">
      {items.map((m) => (
        <button className="line" key={m.id} onClick={() => open(m)}>
          <span className={'stamp ' + m.type}>
            {m.type === 'income' ? (
              <ArrowDownLeft />
            ) : m.type === 'expense' ? (
              <ArrowUpRight />
            ) : m.type === 'transfer' ? (
              <ArrowLeftRight />
            ) : (
              <SlidersHorizontal />
            )}
          </span>
          <span className="grow">
            <b>{m.description || m.categoryName || types[m.type]}</b>
            <small>
              {m.date} · {m.accountName}
              {m.destinationName ? ' → ' + m.destinationName : ''}
            </small>
          </span>
          <span className={'num ' + m.type + (m.voided ? ' void' : '')}>
            {m.type === 'expense' ? '−' : m.type === 'income' ? '+' : ''}
            {money(m.amount)}
            <small>{m.voided ? 'Anulado' : types[m.type]}</small>
          </span>
        </button>
      ))}
    </div>
  ) : (
    <Empty>Sin movimientos para este período.</Empty>
  );
}
export function Add({ children, onClick }) {
  return (
    <button onClick={onClick}>
      <Plus size={16} />
      {children}
    </button>
  );
}
