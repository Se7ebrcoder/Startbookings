/**
 * @jest-environment jsdom
 */

// Mock localStorage BEFORE importing app.js
const localStorageMock = (function() {
  let store = {};
  return {
    getItem(key) {
      return store[key] || null;
    },
    setItem(key, value) {
      store[key] = value.toString();
    },
    clear() {
      store = {};
    },
    removeItem(key) {
      delete store[key];
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Funções extraídas para os módulos ES (js/). Antes vinham do monólito app-v2.js.
import { formatCurrency, daysUntil, normalizeDate } from '../js/utils/format.js';
import { hexToRgba, getRandomColor, escapeHtml } from '../js/utils/dom.js';
import {
  getPaymentStatus, deriveLogisticsStatus, legToFields, getLogisticsCost,
  checklistProgress, reminderState, collectDueReminders
} from '../js/utils/domain.js';
import { friendlyAuthError } from '../js/utils/auth-errors.js';
import { COST_LABELS, DEFAULT_CHECKLIST } from '../js/core/config.js';
import { clearLocalPII } from '../js/core/state.js';

const app = {
  formatCurrency, daysUntil, normalizeDate, hexToRgba, getRandomColor, escapeHtml,
  getPaymentStatus, deriveLogisticsStatus, legToFields, getLogisticsCost,
  checklistProgress, reminderState, collectDueReminders, friendlyAuthError,
  COST_LABELS, DEFAULT_CHECKLIST, clearLocalPII
};

describe('Testes de Funcionalidades Base (StartBookings)', () => {
  
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('formatCurrency() deve formatar valores corretamente para Real (R$)', () => {
    // NumberFormat do JS usa espaço non-breaking (\u00A0) entre o símbolo R$ e o número
    expect(app.formatCurrency(0).replace(/\u00A0/g, ' ')).toBe('R$ 0,00');
    expect(app.formatCurrency(1500).replace(/\u00A0/g, ' ')).toBe('R$ 1.500,00');
    expect(app.formatCurrency(250000.50).replace(/\u00A0/g, ' ')).toBe('R$ 250.000,50');
  });

  test('hexToRgba() deve converter cores Hex para RGBA corretamente', () => {
    // #ff0000 => rgb(255, 0, 0)
    expect(app.hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)');
    // #00ff00 => rgb(0, 255, 0)
    expect(app.hexToRgba('#00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
  });

  test('getRandomColor() deve retornar uma cor da VIBRANT_PALETTE', () => {
    const VIBRANT_PALETTE = [
      "#af52de", "#0a84ff", "#5e5ce6",
      "#30d158", "#ff9f0a", "#ff453a", "#32ade6"
    ];

    const color = app.getRandomColor();
    expect(VIBRANT_PALETTE).toContain(color);
  });

  test('getPaymentStatus() deriva o status de pagamento por artista', () => {
    expect(app.getPaymentStatus(1000, 0)).toBe('pendente');
    expect(app.getPaymentStatus(1000, 400)).toBe('sinal_pago');
    expect(app.getPaymentStatus(1000, 1000)).toBe('pago_total');
    expect(app.getPaymentStatus(1000, 1500)).toBe('pago_total');
    expect(app.getPaymentStatus(0, 0)).toBe('pendente');
  });

  test('deriveLogisticsStatus() retorna pendente sem registro e o status quando há', () => {
    expect(app.deriveLogisticsStatus(null)).toBe('pendente');
    expect(app.deriveLogisticsStatus(undefined)).toBe('pendente');
    expect(app.deriveLogisticsStatus({ status: 'andamento' })).toBe('andamento');
    expect(app.deriveLogisticsStatus({ status: 'concluida' })).toBe('concluida');
  });

  test('daysUntil() calcula dias entre hoje e a data do evento', () => {
    expect(app.daysUntil('2026-06-18', '2026-06-11')).toBe(7);
    expect(app.daysUntil('2026-06-11', '2026-06-11')).toBe(0);
    expect(app.daysUntil('2026-06-10', '2026-06-11')).toBe(-1);
  });

  test('legToFields() formata um trecho de transporte em pares [rótulo, valor]', () => {
    expect(app.legToFields(null)).toEqual([]);
    // Carro próprio e Uber são transporte direto (sem detalhes)
    expect(app.legToFields({ modo: 'uber' })).toEqual([['Transporte', 'Uber']]);
    expect(app.legToFields({ modo: 'carro_proprio' })).toEqual([['Transporte', 'Carro próprio']]);
    // Táxi tem origem/destino
    expect(app.legToFields({ modo: 'taxi', saida: '10h', chegada: '12h', origem: 'A', destino: 'B' }))
      .toEqual([['Transporte', 'Táxi'], ['Saída', '10h'], ['Chegada', '12h'], ['Origem', 'A'], ['Destino', 'B']]);
    // Carro / BlaBlaCar tem motorista, placa, etc.
    const carro = app.legToFields({ modo: 'carro', saida: '8h', motoristaNome: 'Zé', placa: 'ABC1D23' });
    expect(carro[0]).toEqual(['Transporte', 'Carro / BlaBlaCar']);
    expect(carro).toContainEqual(['Motorista', 'Zé']);
    expect(carro).toContainEqual(['Placa', 'ABC1D23']);
  });

  test('escapeHtml() não quebra com null/undefined/número e escapa HTML', () => {
    expect(app.escapeHtml(undefined)).toBe('');
    expect(app.escapeHtml(null)).toBe('');
    expect(app.escapeHtml(123)).toBe('123');
    expect(app.escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });

  test('getLogisticsCost() soma ida + volta + hospedagem do registro', () => {
    const rec = { data: { ida: { modo: 'aviao', valor: 450 }, volta: { modo: 'carro_proprio', valor: 200 }, hotel: { valor: 300 } } };
    expect(app.getLogisticsCost(rec)).toBe(950);
  });

  test('getLogisticsCost() trata ausências e vazios como 0', () => {
    expect(app.getLogisticsCost(null)).toBe(0);
    expect(app.getLogisticsCost({ data: {} })).toBe(0);
    expect(app.getLogisticsCost({ data: { ida: { modo: 'uber', valor: '' }, volta: { modo: 'uber' } } })).toBe(0);
    expect(app.getLogisticsCost({ data: { ida: { valor: '150' }, volta: { valor: 150 }, hotel: null } })).toBe(300);
  });

  test('COST_LABELS mapeia o modo para o rótulo do valor', () => {
    expect(app.COST_LABELS.carro_proprio).toBe('Gasolina');
    expect(app.COST_LABELS.aviao).toBe('Passagem (avião)');
    expect(app.COST_LABELS.onibus).toBe('Passagem (ônibus)');
    expect(app.COST_LABELS.uber).toBe('Uber');
  });

  test('DEFAULT_CHECKLIST tem 7 etapas, todas não feitas', () => {
    expect(Array.isArray(app.DEFAULT_CHECKLIST)).toBe(true);
    expect(app.DEFAULT_CHECKLIST.length).toBe(7);
    expect(app.DEFAULT_CHECKLIST.every(i => i.feito === false && typeof i.texto === 'string')).toBe(true);
  });

  test('checklistProgress conta feitos/total', () => {
    expect(app.checklistProgress([])).toEqual({ feitos: 0, total: 0 });
    expect(app.checklistProgress([{texto:'a',feito:true},{texto:'b',feito:false}])).toEqual({ feitos: 1, total: 2 });
  });

  test('reminderState deriva atrasado/chegando/nenhum', () => {
    const hoje = '2026-06-19';
    expect(app.reminderState({ lembrete: { data: '2026-06-15', ativo: true } }, hoje)).toBe('atrasado');
    expect(app.reminderState({ lembrete: { data: '2026-06-19', ativo: true } }, hoje)).toBe('chegando');
    expect(app.reminderState({ lembrete: { data: '2026-06-21', ativo: true } }, hoje)).toBe('chegando');
    expect(app.reminderState({ lembrete: { data: '2026-06-30', ativo: true } }, hoje)).toBe('nenhum');
    expect(app.reminderState({ lembrete: { data: '2026-06-15', ativo: false } }, hoje)).toBe('nenhum');
    expect(app.reminderState({ lembrete: null }, hoje)).toBe('nenhum');
    expect(app.reminderState({}, hoje)).toBe('nenhum');
  });

  test('collectDueReminders retorna só os ligados em estado de alerta', () => {
    const hoje = '2026-06-19';
    const cards = [
      { groupId:'g1', lembrete:{ data:'2026-06-15', ativo:true } },
      { groupId:'g2', lembrete:{ data:'2026-06-20', ativo:true } },
      { groupId:'g3', lembrete:{ data:'2026-06-30', ativo:true } },
      { groupId:'g4', lembrete:{ data:'2026-06-15', ativo:false } }
    ];
    const evs = [
      { groupId:'g1', event:'Festival X', estado:'SP' },
      { groupId:'g2', event:'Show Y', estado:'RJ' }
    ];
    const due = app.collectDueReminders(cards, evs, hoje);
    expect(due.map(d => d.groupId)).toEqual(['g1','g2']);
    expect(due[0]).toEqual({ groupId:'g1', eventName:'Festival X', estado:'SP', estado_alerta:'atrasado' });
  });

  test('friendlyAuthError mapeia mensagens técnicas do Supabase para texto amigável', () => {
    expect(app.friendlyAuthError('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
    expect(app.friendlyAuthError('Email not confirmed')).toBe('Confirme seu e-mail antes de entrar (veja sua caixa de entrada).');
    expect(app.friendlyAuthError('User already registered')).toBe('Este e-mail já está cadastrado.');
    expect(app.friendlyAuthError('Password should be at least 8 characters')).toBe('A senha precisa ter ao menos 8 caracteres.');
    expect(app.friendlyAuthError('captcha protection: request disallowed')).toBe('Confirme o CAPTCHA e tente novamente.');
    expect(app.friendlyAuthError('Failed to fetch')).toBe('Sem conexão com o servidor. Verifique sua internet.');
    expect(app.friendlyAuthError('algo muito específico não mapeado')).toBe('Algo deu errado. Tente novamente.');
    expect(app.friendlyAuthError('')).toBe('Algo deu errado. Tente novamente.');
    expect(app.friendlyAuthError(null)).toBe('Algo deu errado. Tente novamente.');
  });

  test('normalizeDate converte formatos comuns para AAAA-MM-DD (preserva comportamento)', () => {
    expect(app.normalizeDate('12/07/2026')).toBe('2026-07-12');
    expect(app.normalizeDate('12-07-2026')).toBe('2026-07-12');
    expect(app.normalizeDate('12/07/26')).toBe('2026-07-12');
    expect(app.normalizeDate('2026-07-12')).toBe('2026-07-12');
    expect(app.normalizeDate('12072026')).toBe('2026-07-12');
    expect(app.normalizeDate('120726')).toBe('2026-07-12');
    expect(app.normalizeDate('')).toBe('');
    expect(app.normalizeDate('abc')).toBe('abc');
  });

  test('clearLocalPII remove os dados pessoais/operacionais do localStorage (LGPD)', () => {
    localStorage.setItem('sb_events', '[{"id":1}]');
    localStorage.setItem('sb_clients', '[{"name":"Fulano","contact":"11999"}]');
    localStorage.setItem('sb_logistics', '[{"motorista":"x"}]');
    localStorage.setItem('sb_artistEmails', '{"a@b.com":"Artista"}');
    localStorage.setItem('sb_session_token', 'abc');
    localStorage.setItem('sb_data_version', '3'); // NÃO é PII — deve permanecer

    app.clearLocalPII();

    expect(localStorage.getItem('sb_events')).toBeNull();
    expect(localStorage.getItem('sb_clients')).toBeNull();
    expect(localStorage.getItem('sb_logistics')).toBeNull();
    expect(localStorage.getItem('sb_artistEmails')).toBeNull();
    expect(localStorage.getItem('sb_session_token')).toBeNull();
    // chave não-sensível preservada
    expect(localStorage.getItem('sb_data_version')).toBe('3');
  });
});
