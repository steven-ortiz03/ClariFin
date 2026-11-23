import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { fixture } from './fixture.js';
const sys = await fixture(),
  screens =
    process.env.EVIDENCE_DIR ||
    resolve('..', 'Entrega académica', 'evidencias');
await mkdir(screens, { recursive: true });
const binary = [
  process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
let browser;
try {
  browser = await chromium.launch({ executablePath: binary, headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CO',
  });
  const faults = [];
  page.on('pageerror', (e) => faults.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  if (process.env.DEMO_FRAMES) {
    const frames = process.env.DEMO_FRAMES;
    await mkdir(frames, { recursive: true });
    const cdp = await page.context().newCDPSession(page);
    let index = 0;
    cdp.on('Page.screencastFrame', async (frame) => {
      const n = String(++index).padStart(5, '0');
      await cdp
        .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
        .catch(() => {});
      await writeFile(
        join(frames, n + '.jpg'),
        Buffer.from(frame.data, 'base64'),
      );
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 78,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 2,
    });
  }
  const snapshot = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(screens, name + '.png') });
  };
  const u = await sys.person('Perfil demostrativo'),
    cats = await u.ok('/categories');
  const cat = (n) => cats.find((c) => c.name === n).id;
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
  }).format(new Date());
  const period = today.slice(0, 7),
    date = period + '-01';
  const bank = (
    await u.ok('/accounts', 'POST', {
      name: 'Bancolombia',
      openingBalance: '850000',
      date,
    })
  ).id;
  const nequi = (
    await u.ok('/accounts', 'POST', {
      name: 'Nequi',
      openingBalance: '155000',
      date,
    })
  ).id;
  await u.ok('/budgets', 'POST', {
    categoryId: cat('Alimentación'),
    period,
    limitAmount: '300000',
  });
  for (const [type, c, amount, accountId, description] of [
    ['income', 'Salario', '1850000', bank, 'Pago de nómina'],
    ['expense', 'Alimentación', '245000', bank, 'Mercado del mes'],
    ['expense', 'Transporte', '32000', nequi, 'Pasajes'],
    ['expense', 'Entretenimiento', '48000', nequi, 'Salida al cine'],
  ])
    await u.ok('/transactions', 'POST', {
      type,
      categoryId: cat(c),
      amount,
      accountId,
      date: today,
      description,
    });
  await u.ok('/recurring-schedules', 'POST', {
    name: 'Internet del hogar',
    categoryId: cat('Servicios públicos'),
    estimatedAmount: '95000',
    dueDay: 28,
    startDate: date,
    isVariable: true,
  });
  await page.goto(sys.origin);
  await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
  await snapshot('01-acceso');
  await page.getByLabel('Correo electrónico').fill(u.credentials.email);
  await page.getByLabel('Contraseña').fill(u.credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('Pago de nómina', { exact: true }).waitFor();
  await snapshot('02-resumen');
  console.log('OK · Inicio de sesión y resumen de datos MySQL en Chrome');
  const nav = async (n) => {
    if (
      await page.getByRole('button', { name: 'Menú', exact: true }).isVisible()
    )
      await page.getByRole('button', { name: 'Menú', exact: true }).click();
    await page
      .locator('nav')
      .getByRole('button', { name: n, exact: true })
      .click();
  };
  await nav('Cuentas');
  await page.getByRole('button', { name: 'Nueva cuenta' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Efectivo');
  await dialog.getByLabel('Saldo inicial').fill('40000');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('heading', { name: 'Efectivo', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Transferir', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cuenta de origen').selectOption(String(bank));
  await dialog.getByLabel('Cuenta de destino').selectOption(String(nequi));
  await dialog.getByLabel('Importe').fill('50000');
  await snapshot('03-transferencia');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await nav('Chat');
  await page.getByText('Dictado no disponible en este navegador.').waitFor();
  await page.getByLabel('Mensaje').fill('Me gasté 15 mil en transporte');
  await page.getByRole('button', { name: 'Interpretar', exact: true }).click();
  await page.getByRole('heading', { name: 'Revisa el movimiento' }).waitFor();
  assert.equal(await page.getByLabel('Importe').inputValue(), '15000.00');
  await page.getByLabel('Importe').fill('14000');
  await page.getByLabel('Cuenta', { exact: true }).selectOption(String(nequi));
  await snapshot('04-chat');
  await page.getByRole('button', { name: 'Confirmar movimiento' }).click();
  await page
    .getByRole('heading', { name: 'Revisa el movimiento' })
    .waitFor({ state: 'hidden' });
  console.log(
    'OK · Cuenta, transferencia y chat editable con confirmación REST; voz sin soporte',
  );
  await nav('Historial');
  await page.getByLabel('Tipo', { exact: true }).selectOption('expense');
  await page
    .getByText('Me gasté 15 mil en transporte', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Corregir' }).click();
  await page.getByRole('dialog').getByLabel('Importe').fill('13500');
  await page.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await nav('Presupuestos');
  await page.getByText('Umbral del 80 %', { exact: false }).waitFor();
  await snapshot('05-presupuesto');
  await nav('Compromisos');
  await page.getByRole('button', { name: 'Abonar', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe').fill('25000');
  await dialog.getByLabel('Cuenta', { exact: true }).selectOption(String(bank));
  await dialog.getByRole('button', { name: 'Confirmar abono' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page
    .locator('.cards .panel small')
    .filter({ hasText: 'Parcial' })
    .first()
    .waitFor();
  await snapshot('06-compromisos');
  console.log('OK · Corrección, presupuesto y abono desde la interfaz');
  await nav('Reportes');
  await page
    .getByRole('heading', { name: 'Saldos por cuenta al corte' })
    .waitFor();
  await snapshot('07-reportes');
  await page.setViewportSize({ width: 360, height: 800 });
  await nav('Resumen');
  await page.getByRole('heading', { name: 'Resumen financiero' }).waitFor();
  await page.getByText('Saldo al corte', { exact: true }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'Desbordamiento horizontal',
  );
  await snapshot('08-movil');
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe').fill('8000');
  await dialog
    .getByLabel('Cuenta', { exact: true })
    .selectOption({ label: 'Efectivo' });
  await dialog
    .getByLabel('Categoría', { exact: true })
    .selectOption({ label: 'Transporte' });
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(faults.length, 0, faults.join('\n'));
  console.log(
    'OK · Reporte, móvil de 360 px, movimiento manual y cero errores JavaScript de página',
  );
  const evidence = await u.ok('/reports?from=' + date + '&to=' + today);
  await writeFile(
    join(screens, 'consulta-reporte.json'),
    JSON.stringify(
      {
        contexto: 'Perfil demostrativo en base de prueba',
        method: 'GET',
        path: '/api/reports?from=' + date + '&to=' + today,
        status: 200,
        data: evidence,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await sys.close();
}
