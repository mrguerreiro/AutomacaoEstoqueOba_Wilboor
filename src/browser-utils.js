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

/**
 * Marca a caixinha "Não sou um robô" (reCAPTCHA), se existir. Não tenta resolver
 * desafios de imagem: se o Google pedir um, a execução para com erro.
 */
async function tickRecaptcha(page, label) {
  const frameSel = 'iframe[src*="recaptcha"][src*="anchor"], iframe[title*="reCAPTCHA" i]';
  if (!(await page.locator(frameSel).first().isVisible().catch(() => false))) return;
  const frame = page.frameLocator(frameSel).first();
  await frame.locator('#recaptcha-anchor').click();
  try {
    await frame.locator('#recaptcha-anchor[aria-checked="true"]').waitFor({ timeout: 15000 });
  } catch {
    throw new Error(
      `[${label}] O captcha pediu um desafio de imagens e a sessão salva expirou. ` +
        'Rode "npm run salvar-sessao" no seu computador e atualize o secret OBA_SESSION.',
    );
  }
}

/**
 * Preenche um formulário de login genérico e envia.
 * Com passwordOnly, a tela tem só o campo de senha (caso do painel Wilboor).
 */
async function login(page, { user, password, label, passwordOnly = false, missingHint = '' }) {
  if (!password || (!passwordOnly && !user)) {
    throw new Error(`[${label}] Login necessário, mas as credenciais não foram configuradas. ${missingHint}`.trim());
  }
  const passwordField = await firstVisible(page.locator(PASSWORD_FIELD));
  if (!passwordField) return false;

  const form = page.locator('form').filter({ has: page.locator(PASSWORD_FIELD) });
  const scope = (await form.count()) ? form.first() : page;

  if (!passwordOnly) {
    const userField = await firstVisible(scope.locator(USER_FIELD));
    if (!userField) throw new Error(`[${label}] Campo de usuário/e-mail não encontrado na tela de login`);
    await userField.fill(user);
  }
  await passwordField.fill(password);
  await tickRecaptcha(page, label);

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

module.exports = { firstVisible, isLoginPage, login };
