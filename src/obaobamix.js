'use strict';

const { firstVisible, isLoginPage, login } = require('./browser-utils');

const NOTIFICATION_TEXT_RE = '(esgotou|voltou|novo)\\s*!';
const CODE_RE = 'OOM-\\d{4}';

async function openObaobamix(page, cfg) {
  await page.goto(cfg.loginUrl, { waitUntil: 'networkidle' });
  if (await isLoginPage(page)) {
    await login(page, {
      user: cfg.user,
      password: cfg.password,
      label: 'obaobamix',
      missingHint: 'A sessão salva expirou: rode "npm run salvar-sessao".',
    });
  }
}

async function openBell(page, cfg) {
  const bell = await firstVisible(page.locator(cfg.bellSelector));
  if (!bell) throw new Error('[obaobamix] Sino de notificações não encontrado (ajuste OBA_BELL_SELECTOR)');
  await bell.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
}

/** Rola a lista do sino até o fim, para carregar notificações sob demanda. */
async function scrollNotifications(page) {
  for (let i = 0; i < 30; i += 1) {
    const changed = await page.evaluate((statusRe) => {
      const re = new RegExp(statusRe, 'i');
      const scrollables = [...document.querySelectorAll('body *')].filter((el) => {
        const style = getComputedStyle(el);
        return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 5 && re.test(el.innerText || '');
      });
      let moved = false;
      for (const el of scrollables) {
        const before = el.scrollTop;
        el.scrollTop = el.scrollHeight;
        if (el.scrollTop !== before) moved = true;
      }
      return moved;
    }, NOTIFICATION_TEXT_RE);
    if (!changed) return;
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(700);
  }
}

async function loadAll(page, cfg) {
  await scrollNotifications(page);
  if (!cfg.loadMoreText) return;
  const re = new RegExp(cfg.loadMoreText, 'i');
  for (let i = 0; i < 30; i += 1) {
    const more = await firstVisible(page.getByRole('button', { name: re }).or(page.getByRole('link', { name: re })));
    if (!more) return;
    await more.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
  }
}

/** Retorna o texto de cada notificação visível, na ordem em que aparecem. */
async function readNotificationTexts(page, cfg) {
  if (cfg.itemSelector) {
    return page.locator(cfg.itemSelector).allInnerTexts();
  }
  // Detecção automática: os menores elementos visíveis que contêm, ao mesmo
  // tempo, um status (Esgotou!/Voltou!/Novo!) e um código OOM-XXXX.
  return page.evaluate(
    ({ statusRe, codeRe }) => {
      const sRe = new RegExp(statusRe, 'i');
      const cRe = new RegExp(codeRe, 'i');
      const visible = (el) =>
        typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null;
      const matches = [...document.querySelectorAll('body *')].filter((el) => {
        const text = el.innerText || '';
        return sRe.test(text) && cRe.test(text) && visible(el);
      });
      const set = new Set(matches);
      return matches
        .filter((el) => ![...el.querySelectorAll('*')].some((child) => set.has(child)))
        .map((el) => el.innerText.replace(/\s+/g, ' ').trim());
    },
    { statusRe: NOTIFICATION_TEXT_RE, codeRe: CODE_RE },
  );
}

async function fetchNotifications(page, cfg) {
  await openObaobamix(page, cfg);
  await openBell(page, cfg);
  await loadAll(page, cfg);
  return readNotificationTexts(page, cfg);
}

module.exports = { fetchNotifications };
