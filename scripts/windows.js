import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import {
  existsSync,
  createReadStream,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import mysql from 'mysql2/promise';
process.on('uncaughtException', (e) => {
  console.error('\n✖ ' + e.message);
  process.exit(1);
});
if (process.platform !== 'win32')
  throw Error('Este asistente utiliza MySQL portátil para Windows.');
const root = join(process.env.LOCALAPPDATA, 'IUSAI-GestionFinanciera');
const base = join(root, 'mysql-8.4.13-winx64'),
  data = join(root, 'datos'),
  server = join(base, 'bin', 'mysqld.exe');
const boot = join(root, 'primera-apertura.sql');
await mkdir(root, { recursive: true });
function run(program, args) {
  const r = spawnSync(program, args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) throw Error('No se completó ' + program);
}
async function validZip(path) {
  if (!existsSync(path)) return false;
  const hash = createHash('md5');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex') === '7b94489d5524dea9b27097068bea25a8';
}
if (!existsSync(server)) {
  const archive = join(root, 'mysql-8.4.13.zip');
  if (!(await validZip(archive)))
    run('curl.exe', [
      '-fLsS',
      '--retry',
      '2',
      'https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.13-winx64.zip',
      '-o',
      archive,
    ]);
  if (!(await validZip(archive)))
    throw Error('El archivo de MySQL está incompleto.');
  run('tar.exe', ['-xf', archive, '-C', root]);
}
if (!existsSync('.env')) {
  if (existsSync(data)) throw mismatch();
  let env = (await readFile('.env.example', 'utf8')).replace(
    'DB_PORT=3306',
    'DB_PORT=33478',
  );
  for (const key of ['DB_PASSWORD', 'MYSQL_ROOT_PASSWORD'])
    env = env.replace(
      new RegExp('^' + key + '=\\r?$', 'm'),
      key + '=' + randomBytes(32).toString('hex'),
    );
  await writeFile('.env', env, { flag: 'wx', mode: 0o600 });
}
process.loadEnvFile('.env');
const env = process.env;
if (
  env.DB_HOST !== '127.0.0.1' ||
  env.DB_PORT !== '33478' ||
  env.DB_USER !== 'finanzas' ||
  env.DB_NAME !== 'gestion_financiera'
)
  throw Error(
    'Este asistente corresponde a la instancia dedicada en el puerto 33478. Para otras instancias utiliza npm run migrate.',
  );
const args = ['--no-defaults', '--basedir=' + base, '--datadir=' + data];
if (!existsSync(join(data, 'mysql'))) {
  for (const key of ['DB_PASSWORD', 'MYSQL_ROOT_PASSWORD'])
    if (!/^[a-f0-9]{64}$/.test(env[key]))
      throw Error(
        'La primera apertura requiere el .env generado por el asistente.',
      );
  const statements = [
    "ALTER USER 'root'@'localhost' IDENTIFIED BY '" +
      env.MYSQL_ROOT_PASSWORD +
      "'",
    'CREATE DATABASE IF NOT EXISTS gestion_financiera CHARACTER SET utf8mb4',
    'CREATE DATABASE IF NOT EXISTS gestion_financiera_test CHARACTER SET utf8mb4',
    "CREATE USER IF NOT EXISTS 'finanzas'@'localhost' IDENTIFIED BY '" +
      env.DB_PASSWORD +
      "'",
    "GRANT ALL ON gestion_financiera.* TO 'finanzas'@'localhost'",
    "GRANT ALL ON gestion_financiera_test.* TO 'finanzas'@'localhost'",
  ];
  await writeFile(boot, statements.join(';\n') + ';\n', { mode: 0o600 });
  run(server, [...args, '--initialize-insecure']);
}
// 'ok' conecta, 'denied' hay un MySQL encendido que rechaza las credenciales de .env, 'down' no responde.
async function ready() {
  try {
    const db = await mysql.createConnection({
      host: env.DB_HOST,
      port: +env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectTimeout: 1500,
    });
    await db.end();
    return 'ok';
  } catch (e) {
    return ['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(e.code)
      ? 'denied'
      : 'down';
  }
}
function mismatch() {
  return Error(
    'La base de datos local ya existe, pero fue creada con otras contraseñas.\n' +
      '  Esto pasa al abrir el proyecto desde una carpeta nueva.\n' +
      '  • Si quieres conservar tus datos: copia el archivo .env de la carpeta anterior a esta y vuelve a abrir Iniciar.cmd.\n' +
      '  • Si no tienes datos importantes: ejecuta Reiniciar-datos.cmd y luego Iniciar.cmd.',
  );
}

function tailErr() {
  try {
    const log = readdirSync(data).find((f) => f.endsWith('.err'));
    if (!log) return '';
    const lines = readFileSync(join(data, log), 'utf8').trim().split(/\r?\n/);
    return '\n--- Últimas líneas de ' + log + ' ---\n' + lines.slice(-15).join('\n');
  } catch {
    return '';
  }
}
let state = await ready();
if (state === 'denied') throw mismatch();
if (state === 'down') {
  const instance = spawn(
    server,
    [
      ...args,
      '--port=33478',
      '--bind-address=127.0.0.1',
      '--mysqlx=OFF',
      '--default-time-zone=+00:00',
      ...(existsSync(boot) ? ['--init-file=' + boot] : []),
    ],
    { detached: true, windowsHide: true, stdio: 'ignore' },
  );
  instance.unref();
  for (let i = 0; i < 90 && state === 'down'; i++) {
    await delay(1000);
    state = await ready();
  }
  if (state === 'denied') throw mismatch();
  if (state === 'down')
    throw Error('MySQL no inició en 90 segundos.' + tailErr());
}
if (existsSync(boot)) await unlink(boot);
await import('../database/migrate.js');
