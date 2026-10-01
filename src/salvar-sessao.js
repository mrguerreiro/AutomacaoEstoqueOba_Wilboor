'use strict';

// Abre o obaobamix num navegador visível para você fazer login manualmente
// (incluindo o captcha). Depois salva a sessão em oba-session.json e mostra o
// valor a ser colado no secret OBA_SESSION do GitHub.

const fs = require('node:fs');
const readline = require('node:readline/promises');
const { chromium } = require('playwright');
const { config } = require('./config');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    ...(config.chromiumPath ? { executablePath: config.chromiumPath } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'pt-BR' });
  const page = await context.newPage();
  await page.goto(config.oba.loginUrl);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    '\nFaça login no navegador que abriu (marque "Lembrar" se existir e resolva o captcha).\n' +
      'Quando estiver vendo o Dashboard, volte aqui e pressione ENTER... ',
  );
  rl.close();

  const state = await context.storageState();
  fs.writeFileSync(config.oba.sessionFile, JSON.stringify(state));
  await browser.close();

  console.log(`\nSessão salva em ${config.oba.sessionFile} (não envie este arquivo para o GitHub).`);
  console.log('\nPara o GitHub Actions, copie TODO o texto abaixo e cole no secret OBA_SESSION:\n');
  console.log(Buffer.from(JSON.stringify(state)).toString('base64'));
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
