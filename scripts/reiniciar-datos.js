// Borra la base de datos local (MySQL portátil) para empezar de cero.
// Conserva los programas de MySQL ya descargados, así que no se vuelven a descargar.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
process.chdir(dirname(dirname(fileURLToPath(import.meta.url))));
const root = join(process.env.LOCALAPPDATA || '', 'IUSAI-GestionFinanciera');
const data = join(root, 'datos');
if (!existsSync(data)) {
  console.log('No hay datos locales que borrar. Abre Iniciar.cmd.');
  process.exit(0);
}
console.log('Se borrarán TODOS los perfiles, cuentas y movimientos guardados en:');
console.log('  ' + data);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question('Escribe BORRAR para confirmar: ');
rl.close();
if (answer.trim().toUpperCase() !== 'BORRAR') {
  console.log('Cancelado. No se borró nada.');
  process.exit(0);
}
// Apaga solo el MySQL de esta aplicación (no otros MySQL del equipo).
spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    "Get-Process mysqld -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*IUSAI-GestionFinanciera*' } | Stop-Process -Force",
  ],
  { stdio: 'inherit' },
);
await delay(3000);
try {
  rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
} catch (e) {
  console.error('No se pudo borrar la carpeta (' + e.code + '). Reinicia el equipo y vuelve a intentarlo.');
  process.exit(1);
}
for (const f of [join(root, 'credenciales.env'), join(root, 'primera-apertura.sql'), '.env'])
  rmSync(f, { force: true });
console.log('Listo. Ahora abre Iniciar.cmd para crear una base de datos nueva.');
