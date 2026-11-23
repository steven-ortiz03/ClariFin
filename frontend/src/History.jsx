import React, { useEffect, useState } from 'react';
import { api, params, types } from './api';
import { Field, Lines, option } from './components';
export function History({ data, refresh, openDetail }) {
  const [q, set] = useState({
      from: '',
      to: '',
      type: '',
      accountId: '',
      categoryId: '',
      page: 1,
    }),
    [result, save] = useState(null),
    [error, err] = useState('');
  useEffect(() => {
    let ok = true;
    err('');
    api('/transactions?' + params(q))
      .then((r) => ok && save(r))
      .catch((e) => {
        if (ok) {
          err(e.message);
          save(null);
        }
      });
    return () => {
      ok = false;
    };
  }, [q, refresh]);
  const f = (key, label, choices) => (
    <Field
      key={key}
      label={label}
      choices={choices}
      kind={choices ? 'text' : 'date'}
      required={false}
      value={q[key]}
      onChange={(v) => set({ ...q, [key]: v, page: 1 })}
    />
  );
  return (
    <>
      <div className="filters">
        {f('from', 'Desde')}
        {f('to', 'Hasta')}
        {f(
          'type',
          'Tipo',
          Object.entries(types).map(([k, v]) => option(k, v)),
        )}
        {f(
          'accountId',
          'Cuenta',
          data.accounts.map((a) => option(a.id, a.name)),
        )}
        {f(
          'categoryId',
          'Categoría',
          data.categories.map((a) => option(a.id, a.name)),
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <section className="panel">
          <h2>
            Operaciones <small className="count">{result.total}</small>
          </h2>
          <Lines items={result.items} open={openDetail} />
          {result.total > 40 && (
            <div className="actions">
              <button
                disabled={q.page === 1}
                onClick={() => set({ ...q, page: q.page - 1 })}
              >
                Anterior
              </button>
              <span>Página {q.page}</span>
              <button
                disabled={q.page * 40 >= result.total}
                onClick={() => set({ ...q, page: q.page + 1 })}
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
