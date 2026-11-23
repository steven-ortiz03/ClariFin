// Run inside the demonstration app container. Credentials exist only in its temporary directory.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const marker = join(tmpdir(), 'gf-compose-evidence.json'),
  origin = 'http://127.0.0.1:' + (process.env.PORT || 4178);
const first = process.argv[2] === 'crear';
let cookie = '',
  csrf = '';
async function call(path, method = 'GET', body) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      Cookie: cookie,
      'X-CSRF-Token': csrf,
      'Idempotency-Key': randomUUID(),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(r.ok, method + ' ' + path + ' ' + r.status);
  if (r.headers.has('set-cookie'))
    cookie = r.headers.get('set-cookie').split(';')[0];
  const json = await r.json();
  if (json.data?.csrf) csrf = json.data.csrf;
  return json.data;
}
const user = first
  ? {
      name: 'Prueba de contenedor',
      email: randomUUID() + '@example.invalid',
      password: randomBytes(20).toString('hex'),
    }
  : JSON.parse(await readFile(marker, 'utf8'));
if (first) {
  await call('/api/auth/register', 'POST', user);
  await writeFile(marker, JSON.stringify(user), { mode: 0o600 });
}
await call('/api/auth/login', 'POST', user);
if (first)
  await call('/api/accounts', 'POST', {
    name: 'Verificación',
    openingBalance: '125.50',
    date: '2026-01-01',
  });
const [account] = await call('/api/accounts');
assert.equal(account.balance, '125.50');
const html = await (await fetch(origin + '/')).text();
assert.match(html, /Gestión financiera personal/);
await call('/api/auth/logout', 'POST', {});
if (!first) await unlink(marker);
console.log(
  first
    ? 'OK · React, registro, sesión, escritura y saldo 125.50 COP dentro de Compose.'
    : 'OK · Tras reiniciar MySQL, nuevo login y saldo persistido 125.50 COP.',
);
