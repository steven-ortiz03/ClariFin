import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { routes } from './routes.js';
import { pool, rows } from './config/db.js';
import { mountChat } from './modules/chat.js';
import { catchUpAll } from './modules/recurring.js';
import { Problem } from './core/validation.js';
export async function serve({
  port = Number(process.env.PORT || 4178),
  host = process.env.BIND_HOST || '127.0.0.1',
} = {}) {
  try {
    await rows(pool, 'SELECT 1');
  } catch (e) {
    throw Error(
      'No hay conexión con la base de datos (' +
        (e.code || e.message) +
        '). Ejecuta «npm run iniciar» para preparar todo automáticamente.',
    );
  }
  const app = express(),
    server = createServer(app),
    origin = process.env.APP_ORIGIN || 'http://localhost:' + port;
  const expectedOrigin = () =>
    port === 0 ? 'http://' + host + ':' + server.address().port : origin;
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: null,
          connectSrc: ["'self'", origin.replace(/^http/, 'ws')],
        },
      },
      strictTransportSecurity:
        process.env.COOKIE_SECURE === 'true' ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    next();
  });
  app.get('/health', async (req, res) => {
    await rows(pool, 'SELECT 1');
    res.json({ status: 'ok' });
  });
  app.use(
    '/api',
    (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (req.get('Origin') && req.get('Origin') !== expectedOrigin())
        throw new Problem(403, 'ORIGIN', 'Origen no autorizado.');
      // DELETE no lleva cuerpo; el resto de escrituras exige JSON.
      if (
        !['GET', 'HEAD', 'DELETE'].includes(req.method) &&
        !req.is('application/json')
      )
        throw new Problem(415, 'JSON', 'Envía contenido JSON.');
      next();
    },
    express.json({ limit: '24kb' }),
    routes(),
    (req, res) =>
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Ruta desconocida.' } }),
  );
  const web = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  app.use(express.static(web));
  app.get('/{*path}', (req, res) => res.sendFile('index.html', { root: web }));
  app.use((e, req, res, next) => {
    let status = e instanceof Problem ? e.status : 500,
      code = e.code || 'INTERNAL',
      message = e instanceof Problem ? e.message : 'Error interno.',
      details = e.details;
    if (e instanceof ZodError) {
      status = 400;
      code = 'VALIDATION';
      message = 'Revisa los campos indicados.';
      details = e.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
    }
    if (e.code === 'ER_DUP_ENTRY') {
      status = 409;
      code = 'DUPLICATE';
      message = 'Ya existe un registro con esos datos.';
    }
    if (e.type === 'entity.parse.failed' || e.type === 'entity.too.large') {
      status = e.status;
      code = 'BODY';
      message = 'El cuerpo JSON no es válido o es demasiado extenso.';
    }
    if (
      ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(code)
    ) {
      status = 503;
      message = 'Base de datos temporalmente no disponible.';
    }
    if (status === 500) {
      console.error('Fallo', req.requestId, e.code || e.name);
      code = 'INTERNAL';
    }
    res
      .status(status)
      .json({ error: { code, message, details }, requestId: req.requestId });
  });
  const io = mountChat(server, expectedOrigin);
  app.set('io', io);
  const job = async () => {
    try {
      await catchUpAll();
      await rows(pool, 'DELETE FROM sesiones WHERE expiresAt<=UTC_TIMESTAMP()');
    } catch (e) {
      console.error('Generación mensual pendiente', e.code || e.name);
    }
  };
  await job();
  const timer = setInterval(job, 3600000);
  timer.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return {
    server,
    io,
    origin,
    close: async () => {
      clearInterval(timer);
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const runtime = await serve();
    console.log('Aplicación disponible en ' + runtime.origin);
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, async () => {
        await runtime.close();
        await pool.end();
      });
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    await pool.end().catch(() => {});
  }
}
