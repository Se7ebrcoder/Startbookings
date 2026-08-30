import { newId, randomHex, randomInt, randomPick } from '../js/utils/id.js';

test('newId mantém o formato "<prefixo>-<timestamp><hex>"', () => {
  const id = newId('evt');
  expect(id).toMatch(/^evt-\d{13}[0-9a-f]{8}$/);
});

test('newId não repete em chamadas seguidas (mesmo timestamp)', () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId('log')));
  expect(ids.size).toBe(500);
});

test('randomHex respeita o tamanho pedido', () => {
  expect(randomHex(8)).toMatch(/^[0-9a-f]{16}$/);
});

test('randomInt fica dentro do intervalo e cobre todos os valores', () => {
  const vals = new Set(Array.from({ length: 300 }, () => randomInt(5)));
  vals.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  vals.forEach(v => expect(v).toBeLessThan(5));
  expect(vals.size).toBe(5);
  expect(randomInt(0)).toBe(0);
});

test('randomPick devolve item do array e lida com vazio', () => {
  const arr = ['a', 'b', 'c'];
  expect(arr).toContain(randomPick(arr));
  expect(randomPick([])).toBeUndefined();
});
