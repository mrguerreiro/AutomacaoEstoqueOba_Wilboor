'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { chromium } = require('playwright');
const { assertNotBlocked } = require('../src/browser-utils');

test('detecta bloqueio do Cloudflare com mensagem clara', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(403, { 'Content-Type': 'text/html' }).end(
      '<title>Attention Required! | Cloudflare</title><h1>Sorry, you have been blocked</h1>' +
        '<p>You are unable to access obaobamix.com.br</p><p>Performance &amp; security by Cloudflare</p>',
    );
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await assert.rejects(assertNotBlocked(page, 'obaobamix'), /bloqueado pelo Cloudflare/);
  } finally {
    await browser.close();
    server.close();
  }
});
