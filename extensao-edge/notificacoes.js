// Interpretação do texto das notificações do obaobamix (sem acesso ao navegador).

const STATUS_RE = /(esgotou|voltou|novo)\s*!/gi;
const CODE_RE = /\bOOM-\d{4}(?!\d)/gi;
const STATUS_MAP = { esgotou: 'ESGOTOU', voltou: 'VOLTOU', novo: 'NOVO' };

/**
 * Extrai pares { status, code } de um texto. O formato é "Voltou! OOM-3157" seguido
 * do nome do produto: só vale o primeiro código logo após cada status. Outros tipos
 * de notificação não geram pares.
 */
export function parseNotificationText(text) {
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
 * Recebe os textos na ordem do sino (mais recente primeiro) e devolve, para cada
 * código, só o estado mais recente. "Novo!" é ignorado.
 */
export function actionsFromTexts(texts) {
  const chronological = texts.flatMap((t) => parseNotificationText(t)).reverse();
  const latest = new Map();
  for (const n of chronological) {
    if (n.status === 'NOVO') continue;
    latest.delete(n.code);
    latest.set(n.code, n.status);
  }
  return [...latest].map(([code, status]) => ({ code, status }));
}
