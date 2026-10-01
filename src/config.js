'use strict';

// Todas as configurações vêm de variáveis de ambiente (ou de um arquivo .env local).
// Os seletores têm valores padrão genéricos; ajuste-os aqui ou via ambiente caso
// o layout de algum dos sites mude.

try {
  require('node:process').loadEnvFile?.('.env');
} catch {
  // .env é opcional
}

const env = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const bool = (name, fallback = false) => {
  const value = env(name);
  if (value === undefined) return fallback;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value).toLowerCase());
};

const config = {
  dryRun: bool('DRY_RUN', false),
  headless: !bool('HEADFUL', false),
  timeoutMs: Number(env('TIMEOUT_MS', 30000)),
  artifactsDir: env('ARTIFACTS_DIR', 'artifacts'),
  chromiumPath: env('CHROMIUM_PATH'),

  // Ordem em que o sino lista as notificações: "newest-first" (padrão) ou "oldest-first".
  notificationOrder: env('NOTIFICATION_ORDER', 'newest-first'),

  oba: {
    loginUrl: env('OBA_LOGIN_URL', 'https://app.obaobamix.com.br/'),
    user: env('OBA_USER'),
    password: env('OBA_PASSWORD'),
    bellSelector: env(
      'OBA_BELL_SELECTOR',
      [
        '[aria-label*="notifica" i]',
        '[title*="notifica" i]',
        '[class*="notification" i] button',
        '[class*="notifica" i] button',
        '[class*="bell" i]',
        '[data-icon="bell"]',
        '.fa-bell',
        '.bi-bell',
        '.mdi-bell',
      ].join(', '),
    ),
    // Seletor opcional para cada item de notificação. Se vazio, os itens são
    // detectados automaticamente pelo texto (Esgotou!/Voltou!/Novo! + OOM-XXXX).
    itemSelector: env('OBA_NOTIFICATION_ITEM_SELECTOR'),
    // Texto de um botão "carregar mais" dentro da lista de notificações (regex).
    loadMoreText: env('OBA_LOAD_MORE_TEXT', '^(carregar mais|ver mais|mostrar mais)$'),
  },

  wilboor: {
    loginUrl: env('WILBOOR_LOGIN_URL', 'https://wilboor.com.br/tocadochefe/painel'),
    productsUrl: env('WILBOOR_PRODUCTS_URL', 'https://wilboor.com.br/tocadochefe/painel/produtos'),
    user: env('WILBOOR_USER'),
    password: env('WILBOOR_PASSWORD'),
    manageTabText: env('WILBOOR_MANAGE_TAB_TEXT', 'gerenciar produtos'),
    searchSelector: env(
      'WILBOOR_SEARCH_SELECTOR',
      [
        'input[type="search"]',
        'input[name*="busca" i]',
        'input[name*="search" i]',
        'input[name*="pesquis" i]',
        'input[placeholder*="buscar" i]',
        'input[placeholder*="pesquis" i]',
        'input[placeholder*="procurar" i]',
        'input[placeholder*="search" i]',
      ].join(', '),
    ),
    nextPageText: env('WILBOOR_NEXT_PAGE_TEXT', '^(próxima|proxima|próximo|proximo|›|»|>|next)$'),
    maxPages: Number(env('WILBOOR_MAX_PAGES', 50)),
    pauseText: env('WILBOOR_PAUSE_TEXT', 'pausar'),
    publishText: env('WILBOOR_PUBLISH_TEXT', 'publicar'),
  },
};

function assertCredentials() {
  const missing = [];
  if (!config.oba.user) missing.push('OBA_USER');
  if (!config.oba.password) missing.push('OBA_PASSWORD');
  if (!config.wilboor.user) missing.push('WILBOOR_USER');
  if (!config.wilboor.password) missing.push('WILBOOR_PASSWORD');
  if (missing.length) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }
}

module.exports = { config, assertCredentials };
