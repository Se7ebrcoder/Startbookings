import { escapeHtml, hexToRgba, emptyStateHtml, parseSimpleMarkdown } from '../js/utils/dom.js';
import { friendlyAuthError } from '../js/utils/auth-errors.js';

test('escapeHtml neutraliza HTML e tolera null/numero', () => {
  expect(escapeHtml('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  expect(escapeHtml(null)).toBe('');
  expect(escapeHtml(42)).toBe('42');
});

test('parseSimpleMarkdown aplica negrito/itálico/quebra', () => {
  expect(parseSimpleMarkdown('**a**')).toBe('<strong>a</strong>');
});

test('emptyStateHtml escapa a mensagem', () => {
  expect(emptyStateHtml('<x>')).toBe('<div class="empty-state">&lt;x&gt;</div>');
});

test('hexToRgba converte', () => {
  expect(hexToRgba('#ffcc00', 0.5)).toBe('rgba(255, 204, 0, 0.5)');
});

test('friendlyAuthError mapeia mensagens', () => {
  expect(friendlyAuthError('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
  expect(friendlyAuthError('Password should be at least 8 characters')).toBe('A senha precisa ter ao menos 8 caracteres.');
  expect(friendlyAuthError('')).toBe('Algo deu errado. Tente novamente.');
});
