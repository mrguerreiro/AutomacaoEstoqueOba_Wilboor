'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { config, assertCredentials, loadObaSession } = require('./config');
const { fetchNotifications } = require('./obaobamix');
const { openProducts, applyStatus } = require('./wilboor');
const { parseNotifications, latestActionPerCode } = require('./notifications');

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function run() {
  assertCredentials();
  fs.mkdirSync(config.artifactsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: config.headless,
    ...(config.chromiumPath ? { executablePath: config.chromiumPath } : {}),
  });
  const contextOptions = { viewport: { width: 1440, height: 900 }, locale: 'pt-BR' };
  const obaContext = await browser.newContext({ ...contextOptions, storageState: loadObaSession() });
  const wilContext = await browser.newContext(contextOptions);
  obaContext.setDefaultTimeout(config.timeoutMs);
  wilContext.setDefaultTimeout(config.timeoutMs);

  const obaPage = await obaContext.newPage();
  const wilPage = await wilContext.newPage();

  const report = { startedAt: new Date().toISOString(), dryRun: config.dryRun, actions: [] };
  try {
    log('Acessando obaobamix e painel Wilboor...');
    const [texts] = await Promise.all([
      fetchNotifications(obaPage, config.oba),
      openProducts(wilPage, config.wilboor),
    ]);

    const chronological = parseNotifications(texts, config.notificationOrder);
    const todo = latestActionPerCode(chronological);
    report.notifications = chronological;
    log(`${texts.length} notificação(ões) lida(s); ${todo.length} produto(s) com Esgotou!/Voltou!`);

    for (const item of todo) {
      log(`${item.status === 'ESGOTOU' ? 'Esgotou!' : 'Voltou!'} ${item.code}`);
      try {
        report.actions.push(await applyStatus(wilPage, item, config.wilboor, { dryRun: config.dryRun, log }));
      } catch (err) {
        log(`  ${item.code}: ERRO — ${err.message}`);
        report.actions.push({ ...item, result: 'erro', error: err.message });
        await wilPage.screenshot({ path: path.join(config.artifactsDir, `erro-${item.code}.png`), fullPage: true }).catch(() => {});
        await openProducts(wilPage, config.wilboor).catch(() => {});
      }
    }
    log('Concluído.');
  } catch (err) {
    report.fatal = err.message;
    await obaPage.screenshot({ path: path.join(config.artifactsDir, 'erro-obaobamix.png'), fullPage: true }).catch(() => {});
    await wilPage.screenshot({ path: path.join(config.artifactsDir, 'erro-wilboor.png'), fullPage: true }).catch(() => {});
    throw err;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(config.artifactsDir, 'relatorio.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  return report;
}

if (require.main === module) {
  run()
    .then((report) => {
      if (report.actions.some((a) => a.result === 'erro')) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(`Falha: ${err.message}`);
      process.exitCode = 1;
    });
}

module.exports = { run };
