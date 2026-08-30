/**
 * @jest-environment jsdom
 */

// Estado controlável pelos testes (nomes prefixados com "mock" p/ o hoisting do jest).
let mockRosterData = [];
let mockGoalsData = [];
const mockUpsertCalls = [];

jest.mock('../js/data/client.js', () => ({
  fetchAllRows: (table) => {
    if (table === 'roster') return Promise.resolve({ data: mockRosterData, error: null });
    if (table === 'goals') return Promise.resolve({ data: mockGoalsData, error: null });
    return Promise.resolve({ data: [], error: null });
  },
}));

jest.mock('../js/core/supabase.js', () => ({
  sbClient: {
    from: (table) => ({
      upsert: (rows) => { mockUpsertCalls.push({ table, rows }); return Promise.resolve({ error: null }); },
      select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}));

import { appState } from '../js/core/state.js';
import { loadRosterFromSupabase, backfillRosterIfEmpty } from '../js/data/roster.repo.js';

beforeEach(() => {
  mockRosterData = [];
  mockGoalsData = [];
  mockUpsertCalls.length = 0;
  try { localStorage.clear(); } catch (e) { }
  appState.artists = [];
  appState.sellers = [];
  appState.tagColors = {};
  appState.goals = {};
  appState.currentRole = 'Ingrid (Admin)';
});

test('loadRoster mescla nomes do banco e aplica cores', async () => {
  mockRosterData = [
    { name: 'MC Fulano', kind: 'artist', color: '#ff0000' },
    { name: 'Rayanne', kind: 'seller', color: '#00ff00' },
  ];
  await loadRosterFromSupabase();
  expect(appState.artists).toContain('MC Fulano');
  expect(appState.sellers).toContain('Rayanne');
  expect(appState.tagColors['MC Fulano']).toBe('#ff0000');
});

test('loadRoster preserva nomes que já vieram dos eventos (não sobrescreve)', async () => {
  appState.artists = ['Artista Dos Shows']; // veio de events.repo antes do roster
  mockRosterData = [{ name: 'MC Fulano', kind: 'artist', color: null }];
  await loadRosterFromSupabase();
  expect(appState.artists).toEqual(expect.arrayContaining(['Artista Dos Shows', 'MC Fulano']));
});

test('backfill sobe ao banco só os nomes locais que faltam, uma única vez', async () => {
  mockRosterData = [{ name: 'JaNoBanco', kind: 'artist', color: null }];
  appState.artists = ['JaNoBanco', 'SoNoNavegador'];
  appState.sellers = ['BookerLocal'];
  appState.goals = { Ingrid: 1000 };

  await loadRosterFromSupabase(); // popula o snapshot dbNames
  await backfillRosterIfEmpty();

  const rosterUpserts = mockUpsertCalls.filter(c => c.table === 'roster');
  const nomesSubidos = rosterUpserts.flatMap(c => c.rows.map(r => r.name));
  expect(nomesSubidos).toContain('SoNoNavegador');
  expect(nomesSubidos).toContain('BookerLocal');
  expect(nomesSubidos).not.toContain('JaNoBanco'); // já estava no banco
  expect(mockUpsertCalls.some(c => c.table === 'goals')).toBe(true);

  // Segunda chamada: flag já marcada, não sobe nada de novo.
  mockUpsertCalls.length = 0;
  await backfillRosterIfEmpty();
  expect(mockUpsertCalls.length).toBe(0);
});

test('backfill não roda para não-admin', async () => {
  appState.currentRole = 'Fulano (Booker)';
  appState.artists = ['Qualquer'];
  await loadRosterFromSupabase();
  await backfillRosterIfEmpty();
  expect(mockUpsertCalls.length).toBe(0);
});
