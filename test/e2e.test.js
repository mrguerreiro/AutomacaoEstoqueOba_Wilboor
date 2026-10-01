'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createMockServer } = require('./mock-sites');

test('fluxo completo contra sites simulados', async () => {
  const products = [
    { name: 'Molho especial', sku: 'OOM-0001', paused: true }, // Esgotou -> Voltou: deve publicar
    { name: 'Pimenta', sku: 'OOM-0002', paused: false }, // Esgotou: deve pausar
    { name: 'Tempero', sku: 'OOM-0003', paused: false }, // Novo: ignorar
    { name: 'Sal', sku: 'OOM-0004', paused: false }, // Voltou mas não está pausado: nada
    { name: 'Outro', sku: 'OOM-0005', paused: false },
  ];
  const { server, state } = createMockServer(products);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  Object.assign(process.env, {
    OBA_LOGIN_URL: `${base}/oba`,
    OBA_USER: 'oba@x.com',
    OBA_PASSWORD: '123',
    WILBOOR_LOGIN_URL: `${base}/painel`,
    WILBOOR_PRODUCTS_URL: `${base}/painel/produtos`,
    WILBOOR_USER: 'admin',
    WILBOOR_PASSWORD: 'abc',
    ARTIFACTS_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'oom-')),
    TIMEOUT_MS: '10000',
  });
  const { run } = require('../src/index');

  try {
    const report = await run();
    const byCode = Object.fromEntries(report.actions.map((a) => [a.code, a.result]));
    assert.deepStrictEqual(byCode, {
      'OOM-0002': 'pausado',
      'OOM-7777': 'nao-cadastrado',
      'OOM-0001': 'publicado',
      'OOM-0004': 'sem-alteracao',
    });
    assert.deepStrictEqual(state.clicks.sort(), ['OOM-0001:publicar', 'OOM-0002:pausar']);
    assert.strictEqual(products.find((p) => p.sku === 'OOM-0003').paused, false);
  } finally {
    server.close();
  }
});
