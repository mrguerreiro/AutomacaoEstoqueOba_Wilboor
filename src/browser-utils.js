'use strict';

const USER_FIELD = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[name*="login" i]',
  'input[name*="user" i]',
  'input[name*="usuario" i]',
  'input[id*="email" i]',
  'input[id*="login" i]',
  'input[id*="user" i]',
  'input[type="text"]',
].join(', ');

const PASSWORD_FIELD = 'input[type="password"]';
const SUBMIT_TEXT = /^(entrar|login|acessar|logar|sign in|continuar)$/i;

async function firstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function isLoginPage(page) {
  return Boolean(await firstVisible(page.locator(PASSWORD_FIELD)));
}

/** Preenche um formulário de login genérico (usuário + senha) e envia. */
async function login(page, { user, password, label }) {
  const passwordField = await firstVisible(page.locator(PASSWORD_FIELD));
  if (!passwordField) return false;

  const form = page.locator('form').filter({ has: page.locator(PASSWORD_FIELD) });
  const scope = (await form.count()) ? form.first() : page;

  const userField = await firstVisible(scope.locator(USER_FIELD));
  if (!userField) throw new Error(`[${label}] Campo de usuário/e-mail não encontrado na tela de login`);

  await userField.fill(user);
  await passwordField.fill(password);

  const submit =
    (await firstVisible(scope.locator('button[type="submit"], input[type="submit"]'))) ||
    (await firstVisible(scope.getByRole('button', { name: SUBMIT_TEXT })));

  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    submit ? submit.click() : passwordField.press('Enter'),
  ]);

  await page.waitForFunction(
    (sel) => ![...document.querySelectorAll(sel)].some((el) => el.offsetParent !== null),
    PASSWORD_FIELD,
    { timeout: 20000 },
  ).catch(() => {
    throw new Error(`[${label}] Login falhou (a tela de senha continua visível). Verifique usuário/senha.`);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  return true;
}

/** Confirma modais de confirmação comuns (SweetAlert, Bootstrap, diálogos ARIA). */
async function confirmModalIfAny(page) {
  const modal = await firstVisible(
    page.locator('[role="dialog"], [role="alertdialog"], .modal.show, .modal.in, .swal2-popup, .swal-modal'),
  );
  if (!modal) return false;
  const button = await firstVisible(
    modal.getByRole('button', { name: /^(sim|confirmar|ok|pausar|publicar|continuar|yes)\b/i }),
  );
  if (!button) return false;
  await button.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  return true;
}

module.exports = { firstVisible, isLoginPage, login, confirmModalIfAny };
