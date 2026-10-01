'use strict';

const { firstVisible, isLoginPage, login } = require('./browser-utils');

async function openProducts(page, cfg) {
  await page.goto(cfg.productsUrl, { waitUntil: 'networkidle' });
  if (await isLoginPage(page)) {
    await login(page, { user: cfg.user, password: cfg.password, label: 'wilboor' });
    await page.goto(cfg.productsUrl, { waitUntil: 'networkidle' });
  }
  if (await isLoginPage(page)) throw new Error('[wilboor] Não foi possível acessar o painel após o login');

  // Aba "Gerenciar produtos"
  const tabRe = new RegExp(cfg.manageTabText, 'i');
  const tab = await firstVisible(
    page.getByRole('tab', { name: tabRe }).or(page.getByRole('link', { name: tabRe })).or(page.getByRole('button', { name: tabRe })),
  );
  if (tab) {
    await tab.click();
    await page.waitForLoadState('networkidle').catch(() => {});
  }
}

/**
 * Marca (com atributos data-*) a linha do produto que contém o código e o
 * botão de ação "Pausar" ou "Publicar" dentro dela. Retorna o estado atual.
 */
async function markProduct(page, code, cfg) {
  return page.evaluate(
    ({ code: c, pauseText, publishText }) => {
      document.querySelectorAll('[data-oom-row],[data-oom-action]').forEach((el) => {
        el.removeAttribute('data-oom-row');
        el.removeAttribute('data-oom-action');
      });
      const codeRe = new RegExp(`\\b${c}(?!\\d)`, 'i');
      const pauseRe = new RegExp(`^\\s*${pauseText}\\b`, 'i');
      const publishRe = new RegExp(`^\\s*${publishText}\\b`, 'i');
      const visible = (el) =>
        typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.offsetParent !== null;
      // Remove ícones/símbolos antes do texto (ex.: "⏸ Pausar", "▶ Publicar").
      const labelOf = (el) =>
        [el.innerText, el.value, el.getAttribute('title'), el.getAttribute('aria-label'), el.getAttribute('data-original-title')]
          .filter(Boolean)
          .join(' ')
          .replace(/^[^\p{L}]+/u, '');
      const actionsIn = (root) =>
        [...root.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')].filter(visible);
      const kindOf = (el) => {
        const label = labelOf(el);
        if (pauseRe.test(label)) return 'pause';
        if (publishRe.test(label)) return 'publish';
        return null;
      };

      // Menor elemento visível que contém o código e um botão Pausar/Publicar.
      const candidates = [...document.querySelectorAll('body *')].filter(
        (el) => visible(el) && codeRe.test(el.innerText || '') && actionsIn(el).some(kindOf),
      );
      const set = new Set(candidates);
      const rows = candidates.filter((el) => ![...el.querySelectorAll('*')].some((child) => set.has(child)));
      if (!rows.length) return { found: false };

      const result = { found: true, rows: [] };
      rows.forEach((row, i) => {
        row.setAttribute('data-oom-row', String(i));
        const action = actionsIn(row).find(kindOf);
        action.setAttribute('data-oom-action', String(i));
        result.rows.push({ index: i, action: kindOf(action) });
      });
      return result;
    },
    { code, pauseText: cfg.pauseText, publishText: cfg.publishText },
  );
}

async function searchFor(page, code, cfg) {
  const search = await firstVisible(page.locator(cfg.searchSelector));
  if (!search) return false;
  await search.fill(code);
  await search.press('Enter');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  return true;
}

/** Procura o produto: primeiro pela busca do painel, depois página a página. */
async function locateProduct(page, code, cfg) {
  await searchFor(page, code, cfg);
  let state = await markProduct(page, code, cfg);
  if (state.found) return state;

  // Não achou pela busca: recarrega a listagem (sem filtro, página 1) e procura página a página.
  await openProducts(page, cfg);

  const nextRe = new RegExp(cfg.nextPageText, 'i');
  for (let p = 1; p < cfg.maxPages; p += 1) {
    state = await markProduct(page, code, cfg);
    if (state.found) return state;
    const next = await firstVisible(page.getByRole('link', { name: nextRe }).or(page.getByRole('button', { name: nextRe })));
    if (!next || (await next.isDisabled().catch(() => false))) break;
    await next.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800);
  }
  return { found: false };
}

/**
 * Aplica a ação ao produto:
 *  - ESGOTOU: se o produto estiver publicado (botão "Pausar" visível) → pausar
 *  - VOLTOU:  se o produto estiver pausado (botão "Publicar" visível) → publicar
 */
async function applyStatus(page, { code, status }, cfg, { dryRun, log }) {
  const wanted = status === 'ESGOTOU' ? 'pause' : 'publish';
  const state = await locateProduct(page, code, cfg);
  if (!state.found) {
    log(`  ${code}: não cadastrado no Wilboor — próximo`);
    return { code, status, result: 'nao-cadastrado' };
  }

  const outcomes = [];
  for (const row of state.rows) {
    if (row.action !== wanted) {
      const already = wanted === 'pause' ? 'já está pausado' : 'não está pausado';
      log(`  ${code}: ${already} — nada a fazer`);
      outcomes.push('sem-alteracao');
      continue;
    }
    const verb = wanted === 'pause' ? 'Pausar' : 'Publicar';
    if (dryRun) {
      log(`  ${code}: [DRY_RUN] clicaria em "${verb}"`);
      outcomes.push('dry-run');
      continue;
    }
    // O painel pausa/publica direto no clique, sem janela de confirmação.
    await page.locator(`[data-oom-action="${row.index}"]`).click();
    await page.waitForLoadState('networkidle').catch(() => {});
    log(`  ${code}: clicou em "${verb}"`);
    outcomes.push(wanted === 'pause' ? 'pausado' : 'publicado');
  }

  // Confere se o botão trocou (Pausar -> Publicar ou vice-versa).
  if (outcomes.some((o) => o === 'pausado' || o === 'publicado')) {
    const opposite = wanted === 'pause' ? 'publish' : 'pause';
    let ok = false;
    for (let i = 0; i < 10 && !ok; i += 1) {
      await page.waitForTimeout(1000);
      const now = await markProduct(page, code, cfg);
      ok = now.found && now.rows.every((r) => r.action === opposite);
    }
    if (!ok) {
      await openProducts(page, cfg);
      const now = await locateProduct(page, code, cfg);
      ok = now.found && now.rows.every((r) => r.action === opposite);
    }
    if (!ok) throw new Error(`Cliquei em "${wanted === 'pause' ? 'Pausar' : 'Publicar'}" mas o produto não mudou de estado`);
    log(`  ${code}: confirmado`);
  }

  // Volta para a listagem limpa para a próxima notificação.
  await openProducts(page, cfg);
  return { code, status, result: outcomes.join(',') };
}

module.exports = { openProducts, applyStatus };
