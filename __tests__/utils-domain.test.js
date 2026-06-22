import {
  getPaymentStatus, getLogisticsCost, checklistProgress, reminderState,
  collectDueReminders, deriveLogisticsStatus, eventGroupKey, checkArtistDateConflict
} from '../js/utils/domain.js';

test('getPaymentStatus deriva os 3 estados', () => {
  expect(getPaymentStatus(1000, 1000)).toBe('pago_total');
  expect(getPaymentStatus(1000, 500)).toBe('sinal_pago');
  expect(getPaymentStatus(1000, 0)).toBe('pendente');
});

test('getLogisticsCost soma ida+volta+hotel', () => {
  expect(getLogisticsCost({ data: { ida: { valor: 100 }, volta: { valor: 50 }, hotel: { valor: 200 }, temHospedagem: true } })).toBe(350);
  expect(getLogisticsCost(null)).toBe(0);
});

test('checklistProgress conta feitos/total', () => {
  expect(checklistProgress([{ feito: true }, { feito: false }])).toEqual({ feitos: 1, total: 2 });
  expect(checklistProgress(null)).toEqual({ feitos: 0, total: 0 });
});

test('reminderState identifica atrasado/chegando/nenhum', () => {
  expect(reminderState({ lembrete: { data: '2026-06-20', ativo: true } }, '2026-06-22')).toBe('atrasado');
  expect(reminderState({ lembrete: { data: '2026-06-23', ativo: true } }, '2026-06-22')).toBe('chegando');
  expect(reminderState({ lembrete: { data: '2026-07-30', ativo: true } }, '2026-06-22')).toBe('nenhum');
  expect(reminderState({ lembrete: { data: '2026-06-20', ativo: false } }, '2026-06-22')).toBe('nenhum');
});

test('collectDueReminders junta nome do evento', () => {
  const cards = [{ groupId: 'g1', lembrete: { data: '2026-06-20', ativo: true } }];
  const events = [{ groupId: 'g1', event: 'Show X', estado: 'SP' }];
  const r = collectDueReminders(cards, events, '2026-06-22');
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({ eventName: 'Show X', estado: 'SP', estado_alerta: 'atrasado' });
});

test('deriveLogisticsStatus e eventGroupKey', () => {
  expect(deriveLogisticsStatus(null)).toBe('pendente');
  expect(eventGroupKey({ event: 'E', date: '2026-01-01', venue: 'V', estado: 'SP' })).toBe('E|2026-01-01|V|SP');
  expect(eventGroupKey({ groupId: 'g9' })).toBe('g9');
});

test('checkArtistDateConflict bloqueia mesmo dia+estado', () => {
  const events = [{ id: 1, artist: 'A', date: '2026-01-01', estado: 'SP' }];
  expect(checkArtistDateConflict(events, 'A', '2026-01-01', 'SP', 2).status).toBe('blocked');
  expect(checkArtistDateConflict(events, 'A', '2026-01-01', 'RJ', 2).status).toBe('warned');
  expect(checkArtistDateConflict(events, 'A', '2026-02-02', 'SP', 2).status).toBe('ok');
});
