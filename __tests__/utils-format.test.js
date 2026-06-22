import { formatCurrency, normalizeDate, daysUntil, formatDate } from '../js/utils/format.js';

test('formatCurrency formata em BRL', () => {
  expect(formatCurrency(1000)).toContain('1.000');
});

test('normalizeDate converte formatos comuns para AAAA-MM-DD', () => {
  expect(normalizeDate('12/07/2026')).toBe('2026-07-12');
  expect(normalizeDate('12-07-2026')).toBe('2026-07-12');
  expect(normalizeDate('12/07/26')).toBe('2026-07-12');
  expect(normalizeDate('2026-07-12')).toBe('2026-07-12');
  expect(normalizeDate('12072026')).toBe('2026-07-12');
  expect(normalizeDate('')).toBe('');
  expect(normalizeDate('abc')).toBe('abc');
});

test('daysUntil calcula diferença de dias', () => {
  expect(daysUntil('2026-06-25', '2026-06-22')).toBe(3);
  expect(daysUntil('', '2026-06-22')).toBe(Infinity);
});

test('formatDate converte AAAA-MM-DD para DD/MM/AAAA', () => {
  expect(formatDate('2026-07-12')).toBe('12/07/2026');
  expect(formatDate('')).toBe('');
});
