// Funções executadas DENTRO das páginas (via chrome.scripting.executeScript).
// Cada uma precisa ser autossuficiente: não pode usar nada de fora dela.

/** Estado geral da página: bloqueio, tela de login. */
export function pageState() {
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
  const text = document.body ? document.body.innerText : '';
  return {
    url: location.href,
    blocked: /you have been blocked/i.test(text) && /cloudflare/i.test(text),
    loggedOut: [...document.querySelectorAll('input[type="password"]')].some(visible),
  };
}

/** obaobamix: abre o sino, rola a lista e devolve o texto de cada notificação. */
export async function obaReadNotifications() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
  const statusRe = /(esgotou|voltou|novo)\s*!/i;
  const codeRe = /OOM-\d{4}/i;

  const selectors = [
    'a:has([class*="bell"])',
    'button:has([class*="bell"])',
    '[role="button"]:has([class*="bell"])',
    '[aria-label*="notifica" i]',
    '[title*="notifica" i]',
    '[class*="bell"]',
  ];
  let bell = null;
  for (let i = 0; i < 15 && !bell; i += 1) {
    for (const sel of selectors) {
      bell = [...document.querySelectorAll(sel)].find(visible);
      if (bell) break;
    }
    if (!bell) await sleep(1000);
  }
  if (!bell) return { error: `Sino de notificações não encontrado em ${location.href}` };

  bell.click();
  await sleep(2500);

  // Rola as listas com notificações até o fim, para carregar todas.
  for (let i = 0; i < 30; i += 1) {
    let moved = false;
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 5 && statusRe.test(el.innerText || '')) {
        const before = el.scrollTop;
        el.scrollTop = el.scrollHeight;
        if (el.scrollTop !== before) moved = true;
      }
    }
    if (!moved) break;
    await sleep(1000);
  }

  // Menores elementos visíveis que contêm um status e um código = uma notificação.
  const matches = [...document.querySelectorAll('body *')].filter((el) => {
    const t = el.innerText || '';
    return statusRe.test(t) && codeRe.test(t) && visible(el);
  });
  const set = new Set(matches);
  const texts = matches
    .filter((el) => ![...el.querySelectorAll('*')].some((c) => set.has(c)))
    .map((el) => el.innerText.replace(/\s+/g, ' ').trim());
  return { texts };
}

/** Wilboor: preenche a senha e entra. */
export function wilboorLogin(password) {
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
  const field = [...document.querySelectorAll('input[type="password"]')].find(visible);
  if (!field) return { ok: false };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(field, password);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  const scope = field.form || document;
  const submit = [...scope.querySelectorAll('button, input[type="submit"]')].find(
    (b) => visible(b) && (b.type === 'submit' || /entrar|acessar|login|logar|continuar/i.test(b.innerText || b.value || '')),
  );
  if (submit) submit.click();
  else if (field.form) field.form.requestSubmit();
  return { ok: true };
}

/**
 * Wilboor: (opcionalmente) digita o código no filtro e procura o card do produto.
 * Marca o botão Pausar/Publicar com data-oom-action para o clique posterior.
 * Retorna { found, actions: ['pause'|'publish', ...] } ou { submitted: true } se o
 * filtro precisou enviar um formulário (a página vai recarregar).
 */
export async function wilboorLocate(code, useFilter) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);

  const scan = () => {
    document.querySelectorAll('[data-oom-action]').forEach((el) => el.removeAttribute('data-oom-action'));
    const codeRe = new RegExp(`\\b${code}(?!\\d)`, 'i');
    const labelOf = (el) =>
      [el.innerText, el.value, el.getAttribute('title'), el.getAttribute('aria-label')]
        .filter(Boolean)
        .join(' ')
        .replace(/^[^\p{L}]+/u, '');
    const kindOf = (el) => {
      const label = labelOf(el);
      if (/^pausar\b/i.test(label)) return 'pause';
      if (/^publicar\b/i.test(label)) return 'publish';
      return null;
    };
    const actionsIn = (root) =>
      [...root.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')].filter(visible);
    const candidates = [...document.querySelectorAll('body *')].filter(
      (el) => visible(el) && codeRe.test(el.innerText || '') && actionsIn(el).some(kindOf),
    );
    const set = new Set(candidates);
    const cards = candidates.filter((el) => ![...el.querySelectorAll('*')].some((c) => set.has(c)));
    const actions = cards.map((card, i) => {
      const btn = actionsIn(card).find(kindOf);
      btn.setAttribute('data-oom-action', String(i));
      return kindOf(btn);
    });
    return { found: cards.length > 0, actions };
  };

  // Espera o resultado da busca aparecer: até não sobrar na tela nenhum outro código
  // OOM além do buscado (ou nenhum produto, se não estiver cadastrado).
  const waitFiltered = async (maxMs) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      const codes = (document.body.innerText.match(/OOM-\d{4}/gi) || []).map((c) => c.toUpperCase());
      if (codes.every((c) => c === code.toUpperCase())) {
        await sleep(800); // deixa terminar de desenhar
        return true;
      }
      await sleep(500);
    }
    return false;
  };

  // Procura de novo por alguns segundos antes de concluir que não achou.
  const scanPatiently = async (ms) => {
    const end = Date.now() + ms;
    let result = scan();
    while (!result.found && Date.now() < end) {
      await sleep(1000);
      result = scan();
    }
    return result;
  };

  if (useFilter) {
    const input = [...document.querySelectorAll('input')].find(
      (i) => visible(i) && /filtr|busca|pesquis|procur|search/i.test(`${i.placeholder} ${i.name} ${i.type}`),
    );
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, code);
      for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: code.slice(-1) }));
      // O resultado pode demorar: espera a lista mostrar só o código buscado.
      await sleep(500);
      const filtered = await waitFiltered(15000);
      const result = await scanPatiently(filtered ? 1500 : 3000);
      if (result.found || !input.form) return { ...result, filter: true };
      input.form.requestSubmit();
      return { submitted: true };
    }
  }
  return { ...(await scanPatiently(2000)), filter: false };
}

/** Wilboor: clica no botão marcado por wilboorLocate. */
export function wilboorClick(index) {
  const btn = document.querySelector(`[data-oom-action="${index}"]`);
  if (!btn) return { ok: false };
  btn.click();
  return { ok: true };
}

/** Wilboor: vai para a próxima página da listagem, se houver. */
export function wilboorNextPage() {
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
  const next = [...document.querySelectorAll('a, button')].find(
    (el) => visible(el) && !el.disabled && /^(próxima|proxima|próximo|proximo|›|»|>|next)$/i.test((el.innerText || '').trim()),
  );
  if (!next) return false;
  next.click();
  return true;
}
