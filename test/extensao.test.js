'use strict';

// Carrega a extensão do Edge num Chromium e roda contra os sites simulados.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createMockServer } = require('./mock-sites');

test('extensão: lê o sino e pausa/publica no Wilboor', { timeout: 180000 }, async () => {
  const products = [
    { name: 'Molho especial', sku: 'OOM-0001', paused: true },
    { name: 'Pimenta', sku: 'OOM-0002', paused: false },
    { name: 'Tempero', sku: 'OOM-0003', paused: false },
    { name: 'Sal', sku: 'OOM-0004', paused: false },
    { name: 'Outro', sku: 'OOM-0005', paused: false },
  ];
  const { server, state } = createMockServer(products);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Cópia da extensão com permissão para o servidor local
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
  fs.cpSync(path.join(__dirname, '..', 'extensao-edge'), extDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push('http://127.0.0.1/*');
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest));

  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'prof-')), {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  try {
    await context.addCookies([{ name: 'sess', value: 'ok', url: base }]);
    const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));

    // Espera o service worker terminar de iniciar e criar os alarmes.
    let alarms = [];
    for (let i = 0; i < 20 && alarms.length < 4; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      alarms = await sw.evaluate(async () => (await chrome.alarms.getAll()).map((a) => a.name).sort()).catch(() => []);
    }
    assert.deepStrictEqual(alarms, ['sync-08:00', 'sync-12:00', 'sync-16:00', 'sync-20:00']);

    await sw.evaluate(
      ({ b }) => chrome.storage.local.set({ obaUrl: `${b}/oba`, wilboorUrl: `${b}/painel/produtos`, wilboorPassword: 'abc' }),
      { b: base },
    );

    // 1) Simulação: não clica em nada
    const sim = await sw.evaluate(() => globalThis.runSync({ trigger: 'teste' }));
    console.log(sim.log.join('\n'));
    assert.ifError(sim.fatal);
    assert.strictEqual(state.clicks, undefined);
    assert.deepStrictEqual(Object.fromEntries(sim.actions.map((a) => [a.code, a.result])), {
      'OOM-0004': 'sem-alteracao',
      'OOM-7777': 'nao-cadastrado',
      'OOM-0002': 'simulado',
      'OOM-0001': 'simulado',
    });

    // 2) Execução real
    const real = await sw.evaluate(() => globalThis.runSync({ trigger: 'teste', dryRun: false }));
    console.log(real.log.join('\n'));
    assert.ifError(real.fatal);
    assert.deepStrictEqual(Object.fromEntries(real.actions.map((a) => [a.code, a.result])), {
      'OOM-0004': 'sem-alteracao',
      'OOM-7777': 'nao-cadastrado',
      'OOM-0002': 'pausado',
      'OOM-0001': 'publicado',
    });
    assert.deepStrictEqual(state.clicks.sort(), ['OOM-0001:publicar', 'OOM-0002:pausar']);

    // 3) Sessão do obaobamix expirada: avisa e não mexe no Wilboor
    await context.clearCookies();
    const expired = await sw.evaluate(() => globalThis.runSync({ trigger: 'teste', dryRun: false }));
    assert.match(expired.fatal, /Sessão do obaobamix expirada/);
  } finally {
    await context.close();
    server.close();
  }
});
