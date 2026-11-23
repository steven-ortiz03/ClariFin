import { spawnSync } from 'node:child_process';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'gestion_financiera_test';
if (!process.env.DB_NAME.endsWith('_test'))
  throw Error('Se requiere una base de prueba independiente.');
const r = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', 'backend/tests/finanzas.test.js'],
  { env: process.env, stdio: 'inherit' },
);
process.exitCode = r.status ?? 1;
