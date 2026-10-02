'use strict';

// Carrega a extensão do Edge num Chromium e roda contra os sites simulados.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createMockServer } = require('./mock-sites');

test('extensão: lê o sino e pausa/publica no Wilboor', { timeout: 600000 }, async () => {
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
  const bgPath = path.join(extDir, 'background.js');
  fs.writeFileSync(bgPath, fs.readFileSync(bgPath, 'utf8').replace("const OBA_HOSTS = ['app.obaobamix.com.br'];", "const OBA_HOSTS = ['127.0.0.1'];"));

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
      ({ b }) =>
        chrome.storage.local.set({
          obaUrl: `${b}/oba`,
          wilboorUrl: `${b}/painel/produtos`,
          wilboorPassword: 'abc',
          retryAfterLoginMs: 3000,
        }),
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

    // 3) Busca do painel lenta (resultado só aparece ~3s depois de digitar) e sem paginação:
    //    não pode concluir "não cadastrado" antes do resultado chegar.
    state.slowFilter = 3000;
    products.find((p) => p.sku === 'OOM-0002').paused = false;
    products.find((p) => p.sku === 'OOM-0001').paused = true;
    state.clicks = [];
    const slow = await sw.evaluate(() => globalThis.runSync({ trigger: 'teste', dryRun: false }));
    console.log(slow.log.join('\n'));
    assert.ifError(slow.fatal);
    assert.deepStrictEqual(Object.fromEntries(slow.actions.map((a) => [a.code, a.result])), {
      'OOM-0004': 'sem-alteracao',
      'OOM-7777': 'nao-cadastrado',
      'OOM-0002': 'pausado',
      'OOM-0001': 'publicado',
    });
    state.slowFilter = 0;

    // 4) Janela de trabalho fechada no meio: reabre e continua
    products.find((p) => p.sku === 'OOM-0002').paused = false;
    products.find((p) => p.sku === 'OOM-0001').paused = true;
    state.clicks = [];
    const running = sw.evaluate(() => globalThis.runSync({ trigger: 'teste', dryRun: false }));
    let closed = false;
    for (let i = 0; i < 120 && !closed; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const painel = context.pages().find((pg) => pg.url().includes('/painel/produtos'));
      if (painel) {
        await new Promise((r) => setTimeout(r, 3000));
        await painel.close().catch(() => {});
        closed = true;
      }
    }
    assert.ok(closed, 'a janela do painel deveria ter aparecido');
    const reopened = await running;
    console.log(reopened.log.join('\n'));
    assert.ifError(reopened.fatal);
    assert.ok(reopened.log.some((l) => /reabrindo/.test(l)), 'deveria ter reaberto a janela');
    assert.deepStrictEqual(Object.fromEntries(reopened.actions.map((a) => [a.code, a.result])), {
      'OOM-0004': 'sem-alteracao',
      'OOM-7777': 'nao-cadastrado',
      'OOM-0002': 'pausado',
      'OOM-0001': 'publicado',
    });

    // 5) Sessão do obaobamix expirada: avisa, não mexe no Wilboor e fica pendente
    await context.clearCookies();
    const expired = await sw.evaluate(() => globalThis.runSync({ trigger: 'teste', dryRun: false }));
    assert.match(expired.fatal, /Sessão do obaobamix expirada/);
    assert.strictEqual(await sw.evaluate(async () => (await chrome.storage.local.get('pendingAfterLogin')).pendingAfterLogin), true);

    // 6) Você entra no obaobamix numa aba normal: a rotina roda sozinha logo depois
    const before = await sw.evaluate(async () => (await chrome.storage.local.get('runs')).runs.length);
    const tab = await context.newPage();
    await tab.goto(`${base}/oba`);
    await tab.fill('input[type=email]', 'oba@x.com');
    await tab.fill('input[type=password]', '123');
    await Promise.all([tab.waitForNavigation(), tab.click('button[type=submit]')]);
    let auto = null;
    for (let i = 0; i < 240 && !auto; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      auto = await sw.evaluate(async (n) => {
        const { runs } = await chrome.storage.local.get('runs');
        return runs.length > n && runs[0].finishedAt ? runs[0] : null;
      }, before);
    }
    assert.ok(auto, 'a rotina deveria ter rodado depois do login');
    assert.strictEqual(auto.trigger, 'após login no obaobamix');
    assert.ifError(auto.fatal);
  } finally {
    await context.close();
    server.close();
  }
});
