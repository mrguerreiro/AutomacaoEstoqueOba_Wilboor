'use strict';

// Lógica pura (sem navegador) para interpretar o texto das notificações.

const STATUS_RE = /(esgotou|voltou|novo)\s*!/gi;
const CODE_RE = /\bOOM-\d{4}(?!\d)/gi;

const STATUS_MAP = { esgotou: 'ESGOTOU', voltou: 'VOLTOU', novo: 'NOVO' };

/**
 * Extrai pares { status, code } de um texto de notificação.
 * O formato do obaobamix é "Voltou! OOM-3157" seguido do nome do produto, então
 * só vale o primeiro código logo após cada status; outros códigos no nome do
 * produto são ignorados. Notificações de outros tipos não geram pares.
 */
function parseNotificationText(text) {
  const tokens = [];
  for (const m of String(text).matchAll(STATUS_RE)) {
    tokens.push({ index: m.index, type: 'status', value: STATUS_MAP[m[1].toLowerCase()] });
  }
  for (const m of String(text).matchAll(CODE_RE)) {
    tokens.push({ index: m.index, type: 'code', value: m[0].toUpperCase() });
  }
  tokens.sort((a, b) => a.index - b.index);

  const result = [];
  let current = null;
  for (const t of tokens) {
    if (t.type === 'status') {
      current = t.value;
    } else if (current) {
      result.push({ status: current, code: t.value });
      current = null;
    }
  }
  return result;
}

/**
 * Converte a lista de textos (na ordem exibida pelo site) em uma lista de
 * notificações na ordem cronológica (mais antiga primeiro), sem duplicatas
 * consecutivas idênticas.
 */
function parseNotifications(texts, order = 'newest-first') {
  const parsed = texts.flatMap((t) => parseNotificationText(t));
  return order === 'oldest-first' ? parsed : parsed.reverse();
}

/**
 * Para cada código, mantém apenas o estado mais recente. Assim, se um produto
 * "Esgotou!" e depois "Voltou!", ele é publicado (e não pausado).
 * Notificações "Novo!" são ignoradas, conforme a regra do processo.
 */
function latestActionPerCode(chronological) {
  const latest = new Map();
  for (const n of chronological) {
    if (n.status === 'NOVO') continue;
    latest.delete(n.code); // reinsere para manter a ordem do evento mais recente
    latest.set(n.code, n.status);
  }
  return [...latest].map(([code, status]) => ({ code, status }));
}

module.exports = { parseNotificationText, parseNotifications, latestActionPerCode };
