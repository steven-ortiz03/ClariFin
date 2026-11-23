import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Shapes,
  ChartPie,
  CalendarClock,
  MessageCircle,
  ChartNoAxesCombined,
  LogOut,
  Menu,
  X,
  ChevronRight,
  CircleCheck,
  CircleAlert,
} from 'lucide-react';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-serif-text/latin-400.css';
import { api, money, types, setSession, discardRetries } from './api';
import { Brand, Modal, MovementForm, Form, Add, labelField } from './components';
import { Auth } from './Auth';
import { Dashboard } from './Dashboard';
import { History } from './History';
import { Catalog } from './Catalog';
import { Recurring, Budgets } from './Planning';
import { Chat } from './Chat';
import './style.css';
const navigation = {
  Resumen: LayoutDashboard,
  Historial: ArrowLeftRight,
  Cuentas: Wallet,
  Categorías: Shapes,
  Presupuestos: ChartPie,
  Compromisos: CalendarClock,
  Reportes: ChartNoAxesCombined,
  Chat: MessageCircle,
};
const pageFromHash = () => {
  try {
    const n = decodeURIComponent(location.hash.slice(1));
    return n in navigation ? n : 'Resumen';
  } catch {
    return 'Resumen';
  }
};
const sources = {
  accounts: '/accounts',
  categories: '/categories',
  budgets: '/budgets',
  schedules: '/recurring-schedules',
  commitments: '/commitments',
  alerts: '/alerts',
  recent: '/transactions?size=5',
};
function Toast({ notice, close }) {
  useEffect(() => {
    if (!notice.text) return;
    const t = setTimeout(close, notice.bad ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice.text) return null;
  return (
    <div className="toasts">
      <div role="status" className={'toast' + (notice.bad ? ' bad' : '')}>
        {notice.bad ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
        <span className="grow">{notice.text}</span>
        <button className="icon" aria-label="Cerrar aviso" onClick={close}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
function App() {
  const [user, userSet] = useState(undefined),
    [page, pageSet] = useState(pageFromHash),
    [data, setData] = useState(null),
    [refresh, bump] = useState(0),
    [modal, setModal] = useState(null),
    [notice, setNotice] = useState({ text: '', bad: false }),
    [menu, menuSet] = useState(false);
  const notify = (text, bad = false) => setNotice({ text, bad });
  const revision = useRef(0);
  function login(u) {
    revision.current++;
    setSession(u);
    userSet(u);
    setData(null);
    setModal(null);
    notify('');
    discardRetries();
  }
  useEffect(() => {
    api('/users/me')
      .then(login)
      .catch((e) => {
        if (e.status === 401) login(null);
        else notify(e.message, true);
      });
    const ended = () => login(null),
      nav = () => pageSet(pageFromHash());
    window.addEventListener('session-ended', ended);
    window.addEventListener('hashchange', nav);
    return () => {
      window.removeEventListener('session-ended', ended);
      window.removeEventListener('hashchange', nav);
    };
  }, []);
  async function load() {
    const seq = ++revision.current;
    const pairs = await Promise.all(
      Object.entries(sources).map(async ([k, p]) => [k, await api(p)]),
    );
    if (seq === revision.current) {
      setData(Object.fromEntries(pairs));
      bump((n) => n + 1);
    }
  }
  useEffect(() => {
    if (user) load().catch((e) => notify(e.message, true));
  }, [user]);
  function go(p) {
    location.hash = encodeURIComponent(p);
    pageSet(p);
    menuSet(false);
    notify('');
  }
  const dialog = (title, body) => setModal({ title, body });
  const act = async (fn) => {
    try {
      await fn();
    } catch (e) {
      notify(e.message, true);
    }
  };
  async function save(path, method, body) {
    await api(path, method, body, true);
    setModal(null);
    notify('Cambios guardados.');
    await load().catch(() =>
      notify('Guardado. Actualiza la vista para consultar los cambios.', true),
    );
  }
  const record = () => {
    if (!data.accounts.some((a) => a.active)) {
      notify('Crea primero una cuenta para registrar movimientos.', true);
      go('Cuentas');
      return;
    }
    dialog(
      'Registrar movimiento',
      <MovementForm
        data={data}
        button="Guardar movimiento"
        submit={(b) => save('/transactions', 'POST', b)}
      />,
    );
  };
  async function detail(raw) {
    const m = await api('/transactions/' + raw.id),
      kind = m.commitmentId
        ? 'payments'
        : m.type === 'transfer'
          ? 'transfers'
          : 'transactions';
    const route = '/' + kind + '/' + m.id,
      editable = !m.voided && ['expense', 'income'].includes(m.type);
    const account = data.accounts.find((a) => a.id === m.accountId),
      destination = data.accounts.find((a) => a.id === m.destinationId),
      cat = data.categories.find((c) => c.id === m.categoryId);
    dialog(
      'Detalle de la operación',
      <>
        <p className="detailmoney">{money(m.amount)}</p>
        <dl>
          {Object.entries({
            Tipo: types[m.type],
            Fecha: m.date,
            Cuenta: account?.name,
            Destino: destination?.name,
            Categoría: cat?.name,
            Descripción: m.description,
            Estado: m.voided ? 'Anulado' : 'Vigente',
          })
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </React.Fragment>
            ))}
        </dl>
        <h3>Trazabilidad</h3>
        {m.audit.map((a, i) => (
          <details key={i}>
            <summary>
              {a.action} · {a.createdAt}
            </summary>
            <p>
              {a.previousValue?.amount
                ? money(a.previousValue.amount) + ' → '
                : ''}
              {money(a.newValue?.amount)} · {a.newValue?.date} ·{' '}
              {a.newValue?.description}
            </p>
          </details>
        ))}
        <div className="actions">
          {editable && (
            <button
              onClick={() =>
                dialog(
                  'Corregir ' + (m.commitmentId ? 'abono' : 'movimiento'),
                  <MovementForm
                    data={data}
                    initial={m}
                    payment={!!m.commitmentId}
                    button="Guardar corrección"
                    submit={(b) =>
                      save(route, 'PUT', { ...b, version: m.version })
                    }
                  />,
                )
              }
            >
              Corregir
            </button>
          )}
          {!m.voided && (editable || m.type === 'transfer') && (
            <button
              className="danger"
              onClick={() => {
                if (confirm('¿Anular esta operación y revertir su efecto?'))
                  act(() =>
                    save(route + '/void', 'POST', { version: m.version }),
                  );
              }}
            >
              Anular
            </button>
          )}
        </div>
      </>,
    );
  }
  const openDetail = (m) => act(() => detail(m));
  if (user === undefined)
    return (
      <main className="loading">
        {!notice.text && <span className="spinner" aria-hidden="true" />}
        <span>{notice.text || 'Abriendo tu sesión…'}</span>
        {notice.text && (
          <button onClick={() => location.reload()}>Reintentar</button>
        )}
      </main>
    );
  if (!user) return <Auth login={login} />;
  const ctx = { data, save, dialog, act, go, refresh, openDetail };
  const first = user.name.trim().split(/\s+/)[0];
  return (
    <div className="app">
      <div
        className={'scrim ' + (menu ? 'open' : '')}
        onClick={() => menuSet(false)}
      />
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <Brand />
        <nav>
          {Object.entries(navigation).map(([p, Icon]) => (
            <button
              key={p}
              aria-current={p === page ? 'page' : undefined}
              className={p === page ? 'current' : ''}
              onClick={() => go(p)}
            >
              <Icon size={18} />
              {p}
            </button>
          ))}
        </nav>
        <div className="sidebottom">
          <button
            className="me"
            onClick={() =>
              dialog(
                'Mi perfil',
                <Form
                  fields={[
                    labelField('name', 'Nombre', { maxLength: 90 }),
                    labelField('email', 'Correo electrónico', {
                      kind: 'email',
                    }),
                  ]}
                  initial={{ name: user.name, email: user.email }}
                  submit={async (b) => {
                    const v = await api('/users/me', 'PATCH', b);
                    login(v);
                  }}
                />,
              )
            }
          >
            <span className="avatar" aria-hidden="true">
              {first.slice(0, 1).toUpperCase()}
            </span>
            {user.name}
          </button>
          <button
            onClick={() =>
              act(async () => {
                await api('/auth/logout', 'POST', {});
                login(null);
              })
            }
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="workspace">
        <div className="topbar">
          <button
            className="icon mobile"
            aria-label="Menú"
            onClick={() => menuSet(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <span>Finanzas personales</span>
          <ChevronRight size={14} />
          <b>{page}</b>
          <span className="currency">COP · Colombia</span>
        </div>
        <div className="content">
          <header className="pagehead">
            <div>
              {page === 'Resumen' && <p className="eyebrow">Hola, {first}</p>}
              <h1>
                {page === 'Resumen'
                  ? 'Resumen financiero'
                  : page === 'Chat'
                    ? 'Chat de movimientos'
                    : page}
              </h1>
            </div>
            {data && <Add onClick={record}>Registrar movimiento</Add>}
          </header>
          {!data ? (
            <button className="secondary" onClick={() => act(load)}>
              Cargar información
            </button>
          ) : (
            <>
              {['Resumen', 'Reportes'].includes(page) && (
                <Dashboard key={page} {...ctx} reports={page === 'Reportes'} />
              )}
              {page === 'Historial' && <History {...ctx} />}
              {['Cuentas', 'Categorías'].includes(page) && (
                <Catalog key={page} mode={page} {...ctx} />
              )}
              {page === 'Presupuestos' && <Budgets {...ctx} />}
              {page === 'Compromisos' && <Recurring {...ctx} />}
              {page === 'Chat' && <Chat {...ctx} />}
            </>
          )}
        </div>
      </main>
      <Toast notice={notice} close={() => notify('')} />
      {modal && (
        <Modal
          key={modal.title}
          title={modal.title}
          close={() => setModal(null)}
        >
          {modal.body}
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
