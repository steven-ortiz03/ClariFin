import { Server } from 'socket.io';
import { session } from './auth.js';
import { today, cents, decimal, requireThat } from '../core/validation.js';
import { pool, rows } from '../config/db.js';
const fold = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const vocabulary = {
  Alimentación: /almuerzo|mercado|comida|desayuno|cena/,
  Transporte: /bus\b|taxi|pasaje|transporte/,
  'Servicios públicos': /internet|energia|factura|servicios/,
  Vivienda: /arriendo|alquiler/,
  Salario: /trabajo|salario|nomina|sueldo/,
  Regalos: /regalo/,
  'Trabajo independiente': /honorarios|freelance/,
  Entretenimiento: /cine|juego/,
};
export function interpret(text, accounts = [], categories = []) {
  requireThat(
    typeof text === 'string' && text.trim().length > 0 && text.length <= 240,
    400,
    'TEXT',
    'Escribe un movimiento de hasta 240 caracteres.',
  );
  const s = fold(text.trim());
  const income =
    /\b(recibi|consignaron|gan[eé]|cobre|ingreso|pagaron|depositaron)\b/.test(
      s,
    );
  const expense = /\b(gaste|compre|pague|gasto|pago)\b/.test(s);
  requireThat(
    income !== expense &&
      !/[?¿]/.test(s) &&
      !/\b(no|cuanto|cuantos|transferi|transferir)\b/.test(s),
    422,
    'INTENT',
    'Describe un solo ingreso o gasto realizado.',
  );
  const type = income ? 'income' : 'expense';
  const matches = [
    ...s.matchAll(
      /\d+(?:[.,]\d+)*(?:\s*(?:mil(?:es)?|lucas?|millones?|millon)\b)?/g,
    ),
  ];
  let amount = null;
  if (matches.length === 1) {
    const raw = matches[0][0],
      unit = /millon/.test(raw) ? 1000000n : /mil|luca/.test(raw) ? 1000n : 1n;
    let n = raw.replace(/[^\d.,]/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(n)) n = n.replaceAll('.', '');
    n = n.replace(',', '.');
    if (/^\d{1,13}(\.\d{1,2})?$/.test(n)) {
      const v = cents(n) * unit;
      if (v > 0n && v <= 999999999999999n) amount = decimal(v);
    }
  }
  const eligible = categories.filter((c) => c.active && c.type === type);
  const tags = eligible.filter(
    (c) => s.includes(fold(c.name)) || vocabulary[c.name]?.test(s),
  );
  const ac = accounts.filter((a) => a.active && s.includes(fold(a.name)));
  const date = new Date(today() + 'T12:00:00Z');
  if (/\bayer\b/.test(s)) date.setUTCDate(date.getUTCDate() - 1);
  return {
    type,
    amount,
    accountId: ac.length === 1 ? ac[0].id : null,
    categoryId: tags.length === 1 ? tags[0].id : null,
    date: date.toISOString().slice(0, 10),
    description: text.trim(),
  };
}
export function mountChat(server, origin) {
  const io = new Server(server, {
    maxHttpBufferSize: 8192,
    allowRequest: (req, cb) =>
      cb(null, !req.headers.origin || req.headers.origin === origin()),
  });
  io.use(async (socket, next) => {
    try {
      const s = await session(socket.request.headers.cookie);
      if (!s || socket.handshake.auth.csrf !== s.csrf)
        return next(Error('Sesión requerida.'));
      socket.join(s.tokenHash);
      next();
    } catch {
      next(Error('Sesión no disponible.'));
    }
  });
  io.on('connection', (socket) =>
    socket.on('chat:interpret', async (msg) => {
      const requestId =
        typeof msg?.requestId === 'string' ? msg.requestId.slice(0, 80) : null;
      try {
        const s = await session(socket.request.headers.cookie);
        if (!s) return socket.disconnect(true);
        const accounts = await rows(
          pool,
          'SELECT id,name,active FROM cuentas WHERE userId=?',
          [s.id],
        );
        const categories = await rows(
          pool,
          'SELECT id,name,active,type FROM categorias WHERE userId=?',
          [s.id],
        );
        socket.emit('chat:proposal', {
          requestId,
          ...interpret(msg?.text, accounts, categories),
        });
      } catch (e) {
        socket.emit('chat:error', {
          requestId,
          message: e.status ? e.message : 'No se pudo interpretar el texto.',
        });
      }
    }),
  );
  return io;
}
