import { spawnSync } from 'node:child_process';
// En Windows con el MySQL portátil (puerto 33478), lo enciende antes de las pruebas
// para que `npm test` y `npm run test:ui` funcionen sin abrir la aplicación primero.
export function ensureMysql() {
  if (process.platform !== 'win32' || process.env.DB_PORT !== '33478') return;
  const r = spawnSync(process.execPath, ['scripts/windows.js'], {
    stdio: 'inherit',
    env: { ...process.env, DB_NAME: 'gestion_financiera' },
  });
  if (r.status !== 0)
    throw Error(
      'No se pudo encender MySQL. Abre Iniciar.cmd para ver el detalle.',
    );
}
