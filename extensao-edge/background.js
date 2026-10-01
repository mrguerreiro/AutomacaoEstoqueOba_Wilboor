import { actionsFromTexts } from './notificacoes.js';
import { pageState, obaReadNotifications, wilboorLogin, wilboorLocate, wilboorClick, wilboorNextPage } from './paginas.js';

export const DEFAULTS = {
  horarios: ['08:00', '12:00', '16:00', '20:00'],
  dryRun: true, // começa em "somente simular"; desligue no popup depois de conferir
  wilboorPassword: '',
  obaUrl: 'https://app.obaobamix.com.br/',
  wilboorUrl: 'https://wilboor.com.br/tocadochefe/painel/produtos',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

// ---------- Agendamento ----------

export async function scheduleAlarms() {
  const { horarios } = await getSettings();
  await chrome.alarms.clearAll();
  for (const h of horarios) {
    const [hh, mm] = h.split(':').map(Number);
    const when = new Date();
    when.setHours(hh, mm, 0, 0);
    if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
    // Se o PC estava dormindo no horário, o alarme dispara assim que ele acordar.
    await chrome.alarms.create(`sync-${h}`, { when: when.getTime(), periodInMinutes: 24 * 60 });
  }
}

chrome.runtime.onInstalled.addListener(scheduleAlarms);
chrome.runtime.onStartup.addListener(scheduleAlarms);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('sync-')) runSync({ trigger: `agendado ${alarm.name.slice(5)}` });
});
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'run') {
    runSync({ trigger: 'manual', dryRun: msg.dryRun }).then(reply);
    return true;
  }
  if (msg.type === 'reschedule') {
    scheduleAlarms().then(() => reply({ ok: true }));
    return true;
  }
  return false;
});
chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('oba-login')) chrome.tabs.create({ url: DEFAULTS.obaUrl });
});

// ---------- Utilidades de aba ----------

async function waitComplete(tabId, timeoutMs = 30000) {
  const start = Date.now();
  await sleep(400);
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await sleep(300);
  }
  throw new Error('A página demorou demais para carregar');
}

async function go(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await waitComplete(tabId);
  await sleep(1000);
}

async function exec(tabId, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return res.result;
}

function notify(id, title, message) {
  chrome.notifications.create(`${id}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icone.png',
    title,
    message,
    priority: 2,
  });
}

// ---------- Execução ----------

let running = false;

export async function runSync({ trigger, dryRun } = {}) {
  if (running) return { skipped: 'já existe uma execução em andamento' };
  running = true;
  const settings = await getSettings();
  const simular = dryRun ?? settings.dryRun;
  const run = { startedAt: new Date().toISOString(), trigger, dryRun: simular, log: [], actions: [] };
  const log = (m) => run.log.push(`${new Date().toLocaleTimeString('pt-BR')} ${m}`);

  let win;
  try {
    win = await chrome.windows.create({ url: 'about:blank', state: 'minimized', focused: false });
    const obaTab = win.tabs[0].id;
    const wilTab = (await chrome.tabs.create({ windowId: win.id, url: 'about:blank', active: false })).id;

    // 1) obaobamix: ler notificações
    log('Abrindo obaobamix...');
    await go(obaTab, settings.obaUrl);
    const obaState = await exec(obaTab, pageState);
    if (obaState.blocked) throw new Error('obaobamix bloqueou o acesso (Cloudflare)');
    if (obaState.loggedOut) {
      notify('oba-login', 'Faça login no obaobamix', 'A sessão expirou. Clique aqui, entre no site e a próxima execução funcionará.');
      throw new Error('Sessão do obaobamix expirada: faça login no site');
    }
    const oba = await exec(obaTab, obaReadNotifications);
    if (oba.error) throw new Error(oba.error);
    const todo = actionsFromTexts(oba.texts);
    run.notifications = oba.texts.length;
    log(`${oba.texts.length} notificação(ões) lida(s); ${todo.length} produto(s) com Esgotou!/Voltou!`);

    // 2) Wilboor: entrar
    if (todo.length) await openWilboor(wilTab, settings, log);

    // 3) Para cada código, pausar/publicar
    for (const item of todo) {
      try {
        run.actions.push(await applyStatus(wilTab, item, settings, simular, log));
      } catch (err) {
        log(`${item.code}: ERRO — ${err.message}`);
        run.actions.push({ ...item, result: 'erro', error: err.message });
      }
    }
    log('Concluído.');
  } catch (err) {
    run.fatal = err.message;
    log(`FALHA: ${err.message}`);
  } finally {
    if (win) await chrome.windows.remove(win.id).catch(() => {});
    run.finishedAt = new Date().toISOString();
    await saveRun(run);
    summarize(run);
    running = false;
  }
  return run;
}

async function openWilboor(tabId, settings, log) {
  log('Abrindo painel Wilboor...');
  await go(tabId, settings.wilboorUrl);
  let state = await exec(tabId, pageState);
  if (state.blocked) throw new Error('Wilboor bloqueou o acesso (Cloudflare)');
  if (state.loggedOut) {
    if (!settings.wilboorPassword) throw new Error('Senha do Wilboor não configurada (abra a extensão e salve a senha)');
    log('Wilboor pediu login; entrando com a senha salva...');
    await exec(tabId, wilboorLogin, [settings.wilboorPassword]);
    await sleep(1500);
    await waitComplete(tabId);
    await go(tabId, settings.wilboorUrl);
    state = await exec(tabId, pageState);
    if (state.loggedOut) throw new Error('Não consegui entrar no Wilboor: confira a senha salva na extensão');
  }
}

async function locate(tabId, code, settings, { reset }) {
  if (reset) await go(tabId, settings.wilboorUrl);
  let r = await exec(tabId, wilboorLocate, [code, true]);
  if (r.submitted) {
    await waitComplete(tabId);
    await sleep(1000);
    r = await exec(tabId, wilboorLocate, [code, false]);
  }
  if (r.found) return r;

  // Não achou pelo filtro: percorre as páginas da listagem.
  await go(tabId, settings.wilboorUrl);
  for (let p = 0; p < 50; p += 1) {
    r = await exec(tabId, wilboorLocate, [code, false]);
    if (r.found) return r;
    if (!(await exec(tabId, wilboorNextPage))) break;
    await waitComplete(tabId);
    await sleep(1000);
  }
  return { found: false, actions: [] };
}

async function applyStatus(tabId, { code, status }, settings, simular, log) {
  const wanted = status === 'ESGOTOU' ? 'pause' : 'publish';
  const verb = wanted === 'pause' ? 'Pausar' : 'Publicar';
  const label = status === 'ESGOTOU' ? 'Esgotou!' : 'Voltou!';

  const r = await locate(tabId, code, settings, { reset: true });
  if (!r.found) {
    log(`${label} ${code}: não cadastrado no Wilboor`);
    return { code, status, result: 'nao-cadastrado' };
  }
  const idx = r.actions.findIndex((a) => a === wanted);
  if (idx === -1) {
    log(`${label} ${code}: ${wanted === 'pause' ? 'já está pausado' : 'não está pausado'} — nada a fazer`);
    return { code, status, result: 'sem-alteracao' };
  }
  if (simular) {
    log(`${label} ${code}: [SIMULAÇÃO] clicaria em "${verb}"`);
    return { code, status, result: 'simulado' };
  }

  // O painel pausa/publica direto no clique (sem confirmação).
  for (let i = 0; i < r.actions.length; i += 1) {
    if (r.actions[i] === wanted) await exec(tabId, wilboorClick, [i]);
  }
  await sleep(1500);
  await waitComplete(tabId);

  // Confere se o botão trocou.
  const opposite = wanted === 'pause' ? 'publish' : 'pause';
  let check = await locate(tabId, code, settings, { reset: false });
  if (!(check.found && check.actions.every((a) => a === opposite))) {
    check = await locate(tabId, code, settings, { reset: true });
  }
  if (!(check.found && check.actions.every((a) => a === opposite))) {
    throw new Error(`cliquei em "${verb}" mas o produto não mudou de estado`);
  }
  log(`${label} ${code}: ${wanted === 'pause' ? 'PAUSADO' : 'PUBLICADO'} (confirmado)`);
  return { code, status, result: wanted === 'pause' ? 'pausado' : 'publicado' };
}

async function saveRun(run) {
  const { runs = [] } = await chrome.storage.local.get('runs');
  runs.unshift(run);
  await chrome.storage.local.set({ runs: runs.slice(0, 30) });
}

function summarize(run) {
  const count = (r) => run.actions.filter((a) => a.result === r).length;
  const erros = count('erro');
  if (run.fatal) {
    notify('erro', 'Estoque Oba → Wilboor: falhou', run.fatal);
  } else if (erros) {
    notify('erro', 'Estoque Oba → Wilboor: com erros', `${erros} produto(s) com erro. Abra a extensão para ver o log.`);
  } else if (count('pausado') || count('publicado')) {
    notify('ok', 'Estoque Oba → Wilboor', `${count('pausado')} pausado(s), ${count('publicado')} publicado(s).`);
  }
}

// Permite disparar pelo console do service worker (e pelos testes).
globalThis.runSync = runSync;
