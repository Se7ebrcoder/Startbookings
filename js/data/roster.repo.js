// data/roster.repo.js — persistência do elenco (artistas), equipe (vendedores/
// bookers), cores das tags e metas no Supabase.
//
// Contexto: antes essas listas viviam SÓ no localStorage e sumiam a cada
// logout/troca de navegador. Agora o banco (tabelas roster + goals, migração
// 010) é a fonte de verdade; o localStorage segue como cache. Só o admin
// escreve (RLS); qualquer usuário logado lê.

import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';

function isAdmin() {
  return !!(appState.currentRole && appState.currentRole.includes('(Admin)'));
}

// Snapshot dos nomes que EXISTEM no banco (preenchido por loadRoster). Usado
// pelo backfill para subir só o que falta, sem duplicar.
const dbNames = { artist: new Set(), seller: new Set() };

// Descobre o tipo ('artist'/'seller') de um nome a partir do estado em memória.
function kindOf(name) {
  if ((appState.artists || []).includes(name)) return 'artist';
  if ((appState.sellers || []).includes(name)) return 'seller';
  return null;
}

// Carrega elenco/equipe/cores/metas do banco para o appState. Chamado no login,
// DEPOIS de loadEventsFromSupabase (que já reconstrói do histórico de shows).
// MESCLA em vez de sobrescrever: nomes vindos dos eventos que ainda não estão
// no banco são preservados (a rede de segurança de events.repo continua valendo).
export async function loadRosterFromSupabase() {
  if (!sbClient) return;
  try {
    if (!appState.tagColors) appState.tagColors = {};
    if (!appState.artists) appState.artists = [];
    if (!appState.sellers) appState.sellers = [];
    dbNames.artist.clear();
    dbNames.seller.clear();

    const { data: roster, error } = await fetchAllRows('roster', 'name');
    if (!error && Array.isArray(roster)) {
      roster.forEach(r => {
        if (r.kind !== 'artist' && r.kind !== 'seller') return;
        dbNames[r.kind].add(r.name);
        const list = r.kind === 'artist' ? appState.artists : appState.sellers;
        if (!list.includes(r.name)) list.push(r.name);
        if (r.color) appState.tagColors[r.name] = r.color; // cor do banco manda
      });
    }

    const { data: goals, error: gErr } = await fetchAllRows('goals', 'name');
    if (!gErr && Array.isArray(goals) && goals.length > 0) {
      if (!appState.goals) appState.goals = {};
      goals.forEach(g => { appState.goals[g.name] = Number(g.amount) || 0; });
    }
  } catch (e) {
    console.error('loadRosterFromSupabase error:', e);
  }
}

// Migração/rede de segurança: sobe para o banco os nomes/metas que o admin tem
// localmente (localStorage + reconstruídos dos eventos) e que AINDA NÃO estão na
// tabela roster. É aditivo (upsert, nunca apaga) e roda no máximo uma vez por
// navegador (flag em localStorage), evitando "ressuscitar" itens em logins
// futuros. Só admin escreve (garantido também pelo RLS).
export async function backfillRosterIfEmpty() {
  if (!sbClient || !isAdmin()) return;
  try {
    try { if (localStorage.getItem('sb_roster_backfilled') === '1') return; } catch (e) { }

    const rows = [];
    (appState.artists || []).forEach(n => {
      if (n && !dbNames.artist.has(n)) rows.push({ name: n, kind: 'artist', color: appState.tagColors?.[n] || null });
    });
    (appState.sellers || []).forEach(n => {
      if (n && !dbNames.seller.has(n)) rows.push({ name: n, kind: 'seller', color: appState.tagColors?.[n] || null });
    });
    if (rows.length > 0) {
      const { error: upErr } = await sbClient.from('roster').upsert(rows);
      if (upErr) { console.error('backfill roster error:', upErr); return; }
      rows.forEach(r => dbNames[r.kind].add(r.name));
    }

    const goalRows = Object.entries(appState.goals || {}).map(([name, amount]) => ({ name, amount: Number(amount) || 0 }));
    if (goalRows.length > 0) {
      const { error: gUpErr } = await sbClient.from('goals').upsert(goalRows);
      if (gUpErr) { console.error('backfill goals error:', gUpErr); return; }
    }

    try { localStorage.setItem('sb_roster_backfilled', '1'); } catch (e) { }
  } catch (e) {
    console.error('backfillRosterIfEmpty error:', e);
  }
}

// --- Escritas (chamadas pelas Configurações). Best-effort, não bloqueiam a UI.
export function upsertRosterEntry(name, kind, color) {
  if (!sbClient || !isAdmin()) return;
  sbClient.from('roster').upsert({ name, kind, color: color || null }).then(({ error }) => {
    if (error) console.error('roster upsert error:', error);
  });
}

export function deleteRosterEntry(name, kind) {
  if (!sbClient || !isAdmin()) return;
  sbClient.from('roster').delete().eq('name', name).eq('kind', kind).then(({ error }) => {
    if (error) console.error('roster delete error:', error);
  });
}

// Renomear: name é PK, então apaga o antigo e cria o novo (preservando a cor).
export function renameRosterEntry(oldName, newName, kind, color) {
  if (!sbClient || !isAdmin()) return;
  deleteRosterEntry(oldName, kind);
  upsertRosterEntry(newName, kind, color);
}

// Atualiza só a cor da tag; descobre o tipo pelo estado atual.
export function updateRosterColor(name, color) {
  if (!sbClient || !isAdmin()) return;
  const kind = kindOf(name);
  if (!kind) return;
  sbClient.from('roster').update({ color }).eq('name', name).eq('kind', kind).then(({ error }) => {
    if (error) console.error('roster color error:', error);
  });
}

export function upsertGoal(name, amount) {
  if (!sbClient || !isAdmin()) return;
  sbClient.from('goals').upsert({ name, amount: Number(amount) || 0 }).then(({ error }) => {
    if (error) console.error('goal upsert error:', error);
  });
}
