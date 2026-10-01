'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseNotificationText, parseNotifications, latestActionPerCode } = require('../src/notifications');

test('extrai status e código de uma notificação', () => {
  assert.deepStrictEqual(parseNotificationText('Esgotou! Produto X (OOM-1234) há 2 horas'), [
    { status: 'ESGOTOU', code: 'OOM-1234' },
  ]);
  assert.deepStrictEqual(parseNotificationText('Voltou ! OOM-0042 Kit com OOM-1111 (OOM-KIT020) há 3 horas'), [
    { status: 'VOLTOU', code: 'OOM-0042' },
  ]);
  assert.deepStrictEqual(parseNotificationText('Novo! OOM-9999'), [{ status: 'NOVO', code: 'OOM-9999' }]);
});

test('ignora códigos inválidos e textos sem status', () => {
  assert.deepStrictEqual(parseNotificationText('Esgotou! OOM-12345 OOM-12'), []);
  assert.deepStrictEqual(parseNotificationText('Produto OOM-1234'), []);
  assert.deepStrictEqual(parseNotificationText('Preço alterado! OOM-1234'), []);
  assert.deepStrictEqual(parseNotificationText('OOM-1234 Esgotou!'), []);
});

test('mantém apenas o estado mais recente por código e ignora Novo!', () => {
  // Lista exibida com a mais recente primeiro
  const shown = ['Voltou! OOM-0001', 'Novo! OOM-0003', 'Esgotou! OOM-0001', 'Esgotou! OOM-0002'];
  const chronological = parseNotifications(shown, 'newest-first');
  assert.deepStrictEqual(latestActionPerCode(chronological), [
    { code: 'OOM-0002', status: 'ESGOTOU' },
    { code: 'OOM-0001', status: 'VOLTOU' },
  ]);
});
