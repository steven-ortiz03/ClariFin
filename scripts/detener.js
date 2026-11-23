// Detiene el servidor, el MySQL portátil de Windows y/o los contenedores de Docker.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(dirname(dirname(fileURLToPath(import.meta.url))));
if (existsSync('.env')) process.loadEnvFile('.env');
const windows = process.platform === 'win32';
const port = process.env.PORT || '4178';
const out = (cmd, args, env) =>
  spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: windows,
    env: { ...process.env, ...env },
  });
let hecho = false;

// Servidor Node que escucha en el puerto de la aplicación
try {
  if (windows) {
    const lines = out('netstat', ['-ano', '-p', 'tcp']).stdout.split('\n');
    const pids = new Set(
      lines
        .filter((l) => l.includes(':' + port + ' ') && l.includes('LISTENING'))
        .map((l) => l.trim().split(/\s+/).pop()),
    );
    for (const pid of pids)
      if (pid && pid !== '0') {
        out('taskkill', ['/PID', pid, '/F']);
        hecho = true;
      }
  }
} catch {}

// MySQL portátil (Windows)
if (windows && process.env.DB_PORT === '33478' && process.env.LOCALAPPDATA) {
  const admin = join(
    process.env.LOCALAPPDATA,
    'IUSAI-GestionFinanciera',
    'mysql-8.4.13-winx64',
    'bin',
    'mysqladmin.exe',
  );
  if (existsSync(admin) && process.env.MYSQL_ROOT_PASSWORD) {
    const r = out(
      '"' + admin + '"',
      [
        '--protocol=tcp',
        '--host=127.0.0.1',
        '--port=33478',
        '--user=root',
        'shutdown',
      ],
      { MYSQL_PWD: process.env.MYSQL_ROOT_PASSWORD },
    );
    if (r.status === 0) hecho = true;
  }
}

// Docker Compose
if (existsSync('compose.yaml')) {
  const r = spawnSync('docker', ['compose', 'stop'], {
    shell: windows,
    stdio: 'ignore',
  });
  if (r.status === 0) hecho = true;
}
console.log(
  hecho
    ? '✔ Aplicación detenida. Tus datos se conservan para la próxima vez.'
    : 'No había nada en ejecución.',
);
