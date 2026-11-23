// Arranque de un solo paso: prepara la configuración, las dependencias, la base de
// datos y la interfaz, inicia el servidor y abre el navegador.
//   Windows: doble clic en Iniciar.cmd   (o: npm run iniciar)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  mkdirSync,
  openSync,
  writeSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const windows = process.platform === 'win32';
const sinAbrir = process.argv.includes('--no-abrir');
// --oculto (lo usa «Abrir ClariFin.vbs»): sin consola. Todo se escribe en
// .runtime/registro.txt y los errores se muestran en una ventana de Windows.
const oculto = process.argv.includes('--oculto');
let salida = 'inherit';
if (oculto) {
  mkdirSync('.runtime', { recursive: true });
  const fd = openSync('.runtime/registro.txt', 'w');
  salida = ['ignore', fd, fd];
  const escribir = (...a) => writeSync(fd, a.join(' ') + '\n');
  console.log = escribir;
  console.error = escribir;
}
function ventana(texto, icono = 'Error') {
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-Command',
      "Add-Type -AssemblyName PresentationFramework; [void][System.Windows.MessageBox]::Show($env:CLARIFIN_MSG, 'ClariFin', 'OK', '" +
        icono +
        "')",
    ],
    { env: { ...process.env, CLARIFIN_MSG: texto }, windowsHide: true },
  );
}
const say = (m) => console.log('\n▶ ' + m);
const fail = (m) => {
  console.error('\n✖ ' + m);
  if (oculto)
    ventana(
      'No fue posible iniciar ClariFin.\n\n' +
        m +
        '\n\nDetalles: .runtime\\registro.txt (o abre Iniciar.cmd para ver el proceso).',
    );
  process.exit(1);
};
const run = (cmd, args, opts = {}) =>
  // node.exe vive en «C:\Program Files\…»: sin shell para no romper la ruta con espacios.
  spawnSync(cmd, args, {
    stdio: salida,
    windowsHide: true,
    shell: windows && cmd !== process.execPath,
    ...opts,
  });

// 1 ─ Requisitos
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12))
  fail(
    'Se necesita Node.js 22.12 o posterior (tienes ' +
      process.versions.node +
      '). Descárgalo en https://nodejs.org',
  );

// 2 ─ Configuración local (.env). Si ya existe, no se toca nunca.
// Las credenciales de MySQL portátil se guardan también junto a sus datos, para que
// cualquier copia del proyecto (otra carpeta, otra descarga) use las mismas.
const local = windows ? join(process.env.LOCALAPPDATA || '', 'IUSAI-GestionFinanciera') : '';
const compartido = local && join(local, 'credenciales.env');
function crearEnv() {
  if (existsSync('.env')) return;
  if (compartido && existsSync(compartido)) {
    copyFileSync(compartido, '.env');
    console.log('Se usaron las credenciales de tu base de datos local existente.');
    return;
  }
  const hex = () => randomBytes(32).toString('hex');
  writeFileSync(
    '.env',
    [
      '# Generado por scripts/iniciar.js. Conserva este archivo junto con tus datos.',
      'DB_HOST=127.0.0.1',
      'DB_PORT=' + (windows ? '33478' : '3306'),
      'DB_NAME=gestion_financiera',
      'DB_USER=finanzas',
      'DB_PASSWORD=' + hex(),
      'MYSQL_ROOT_PASSWORD=' + hex(),
      'PORT=4178',
      'BIND_HOST=127.0.0.1',
      'APP_ORIGIN=http://localhost:4178',
      'COOKIE_SECURE=false',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log('Configuración local creada (.env).');
}
crearEnv();
process.loadEnvFile('.env');
const port = Number(process.env.PORT || 4178);
const url = process.env.APP_ORIGIN || 'http://localhost:' + port;

async function vivo() {
  try {
    const [s, h] = await Promise.all([
      fetch('http://127.0.0.1:' + port + '/health').then((r) => r.json()),
      fetch('http://127.0.0.1:' + port + '/').then((r) => r.text()),
    ]);
    return s.status === 'ok' && h.includes('financiera personal</title>');
  } catch {
    return false;
  }
}
function abrir() {
  if (sinAbrir) return;
  const [cmd, args] = ['cmd', ['/c', 'start', '', url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' })
      .on('error', () => {})
      .unref();
  } catch {}
}
async function esperar(ms = 60000) {
  for (let t = 0; t < ms; t += 500) {
    if (await vivo()) return true;
    await delay(500);
  }
  return false;
}
const alcanzable = (host, p) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port: p, timeout: 1500 });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('timeout', () => (s.destroy(), resolve(false)));
    s.once('error', () => resolve(false));
  });
const hayDocker = () =>
  spawnSync('docker', ['compose', 'version'], { shell: windows, stdio: 'ignore' })
    .status === 0;

if (await vivo()) {
  console.log('La aplicación ya está en marcha: ' + url);
  abrir();
  process.exit(0);
}

// 3 ─ ¿Cómo se obtiene la base de datos?
const dedicada =
  windows &&
  process.env.DB_HOST === '127.0.0.1' &&
  process.env.DB_PORT === '33478';
const dbPort = Number(process.env.DB_PORT || 3306);
const modo = dedicada
  ? 'portátil'
  : (await alcanzable(process.env.DB_HOST || '127.0.0.1', dbPort))
    ? 'existente'
    : hayDocker()
      ? 'docker'
      : null;
if (!modo)
  fail(
    'No hay una base de datos MySQL disponible.\n' +
      '  • Instala Docker Desktop (https://www.docker.com/products/docker-desktop) y vuelve a ejecutar, o\n' +
      '  • indica en .env los datos de tu MySQL (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).',
  );

if (modo === 'docker') {
  say('Iniciando con Docker (primera vez: tarda unos minutos)…');
  if (run('docker', ['compose', 'up', '--build', '-d']).status !== 0)
    fail('Docker Compose no pudo iniciar. Revisa el mensaje anterior.');
  say('Esperando a que la aplicación responda…');
  if (!(await esperar(120000)))
    fail('La aplicación no respondió. Revisa: docker compose logs');
  console.log(
    '\n✔ Lista en ' + url + '   (para detenerla: npm run detener)',
  );
  abrir();
  process.exit(0);
}

// 4 ─ Dependencias y base de datos
say('Instalando dependencias (solo la primera vez)…');
if (!existsSync('node_modules/mysql2/package.json')) {
  let r = run('npm', [existsSync('package-lock.json') ? 'ci' : 'install']);
  if (r.status !== 0) r = run('npm', ['install']);
  if (r.status !== 0)
    fail('No se pudieron instalar las dependencias. ¿Hay conexión a Internet?');
}
say(
  modo === 'portátil'
    ? 'Preparando MySQL portátil (la primera vez descarga unos 250 MB)…'
    : 'Aplicando el esquema en tu MySQL…',
);
const prepararDb =
  modo === 'portátil'
    ? run(process.execPath, ['scripts/windows.js'])
    : run(process.execPath, ['database/migrate.js']);
if (prepararDb.status !== 0)
  fail('No se pudo preparar la base de datos. Revisa el mensaje anterior.');
if (modo === 'portátil') {
  mkdirSync(local, { recursive: true });
  copyFileSync('.env', compartido);
}

// 5 ─ Interfaz (solo se recompila si cambió el código) y servidor
say('Preparando la interfaz…');
function huella() {
  const h = createHash('sha256');
  const visit = (dir) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) visit(p);
      else h.update(p).update(readFileSync(p));
    }
  };
  visit('frontend/src');
  for (const f of ['frontend/index.html', 'frontend/package.json'])
    h.update(readFileSync(f));
  return h.digest('hex');
}
const marca = 'frontend/dist/.build-hash',
  actual = huella();
const vigente =
  existsSync('frontend/dist/index.html') &&
  existsSync(marca) &&
  readFileSync(marca, 'utf8') === actual;
if (!vigente) {
  if (run('npm', ['run', 'build']).status !== 0)
    fail('No se pudo compilar la interfaz. Revisa el mensaje anterior.');
  writeFileSync(marca, actual);
} else console.log('Interfaz al día.');

say('Iniciando el servidor…');
if (oculto) {
  // El servidor queda en segundo plano; se apaga con «Cerrar ClariFin.vbs».
  spawn(process.execPath, ['backend/src/server.js'], {
    detached: true,
    windowsHide: true,
    stdio: salida,
  }).unref();
  if (!(await esperar(30000)))
    fail('El servidor no respondió. Revisa .runtime\\registro.txt.');
  console.log('\n✔ Lista en ' + url);
  abrir();
  process.exit(0);
}
const server = spawn(process.execPath, ['backend/src/server.js'], {
  stdio: 'inherit',
});
server.once('exit', (code) => process.exit(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM'])
  process.once(s, () => server.kill(s));
if (await esperar(30000)) {
  console.log(
    '\n✔ Lista en ' +
      url +
      '\n  Cierra esta ventana (o pulsa Ctrl+C) para detener el servidor.\n  Para apagar también MySQL: npm run detener',
  );
  abrir();
}
