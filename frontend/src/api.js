let csrf;
export const setSession = (user) => {
  csrf = user?.csrf;
};
export const sessionToken = () => csrf;
export const day = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(
    new Date(),
  );
export const money = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: Number(value) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value || 0);
export const types = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
  opening: 'Apertura',
  adjustment: 'Ajuste',
};
export const states = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
};
export function params(query) {
  return new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== '' && v != null),
  ).toString();
}
const pending = new Map();
export function discardRetries() {
  pending.clear();
}
export async function api(path, method = 'GET', body, financial = false) {
  const identity = method + path + JSON.stringify(body);
  if (financial && !pending.has(identity))
    pending.set(identity, crypto.randomUUID());
  const headers = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (financial) headers['Idempotency-Key'] = pending.get(identity);
  let res, payload;
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    payload = await res.json();
  } catch {
    // Sin conexión o respuesta que no es JSON: se conserva la clave para reintentar sin duplicar.
    throw Error(
      'No hay conexión con el servidor. Revisa que la aplicación siga abierta e inténtalo de nuevo.',
    );
  }
  if (res.ok) {
    pending.delete(identity);
    return payload.data;
  }
  const { message, details } = payload.error || {};
  if (res.status < 500) pending.delete(identity);
  if (res.status === 401 && !path.startsWith('/auth/') && path !== '/users/me')
    window.dispatchEvent(new Event('session-ended'));
  const fields = Array.isArray(details)
    ? details.map((d) => d.field + ' · ' + d.message).join(' / ')
    : '';
  throw Object.assign(
    Error([message || 'Error inesperado.', fields].filter(Boolean).join(' ')),
    { status: res.status },
  );
}
