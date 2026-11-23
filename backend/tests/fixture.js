import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { ensureMysql } from './mysql.js';
export async function fixture() {
  ensureMysql();
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'gestion_financiera_test';
  assert.match(
    process.env.DB_NAME,
    /_test$/,
    'Utiliza una base terminada en _test.',
  );
  const m = spawnSync(process.execPath, ['database/migrate.js'], {
    stdio: 'inherit',
    env: process.env,
  });
  assert.equal(
    m.status,
    0,
    'Falta crear la base de pruebas o aplicar permisos.',
  );
  const { serve } = await import('../src/server.js');
  const { pool } = await import('../src/config/db.js');
  const app = await serve({ port: 0, host: '127.0.0.1' });
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  function client() {
    return {
      cookie: '',
      csrf: '',
      async req(path, method = 'GET', body, key = randomUUID(), extra = {}) {
        const r = await fetch(origin + '/api' + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Cookie: this.cookie,
            'X-CSRF-Token': this.csrf,
            'Idempotency-Key': key,
            ...extra,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (r.headers.has('set-cookie'))
          this.cookie = r.headers.get('set-cookie').split(';')[0];
        const payload = await r.json();
        if (payload.data?.csrf) this.csrf = payload.data.csrf;
        return { status: r.status, ...payload };
      },
      async ok(...args) {
        const r = await this.req(...args);
        assert.ok(r.status < 300, JSON.stringify(r));
        return r.data;
      },
    };
  }
  async function person(name = 'Perfil de prueba') {
    const c = client();
    c.credentials = {
      email: 'prueba-' + randomUUID() + '@example.invalid',
      password: randomBytes(18).toString('hex'),
    };
    const u = await c.ok('/auth/register', 'POST', { ...c.credentials, name });
    c.id = u.id;
    await c.ok('/auth/login', 'POST', c.credentials);
    return c;
  }
  return {
    app,
    pool,
    origin,
    client,
    person,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
