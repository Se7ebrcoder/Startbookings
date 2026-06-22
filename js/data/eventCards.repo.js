// data/eventCards.repo.js — leitura/gravação dos cards do Kanban (event_cards).
import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';
import { setSyncStatus } from '../ui/toast.js';
import { eventGroupKey } from '../utils/domain.js';
import { DEFAULT_CHECKLIST } from '../core/config.js';

export async function loadEventCardsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data, error } = await fetchAllRows('event_cards', 'group_id');
    if (error) { console.error("Supabase event_cards fetch error:", error); return; }
    appState.eventCards = (data || []).map(r => ({
      groupId: r.group_id,
      coluna: r.coluna || 'todo',
      checklist: Array.isArray(r.checklist) ? r.checklist : [],
      lembrete: r.lembrete || null
    }));
    try { localStorage.setItem("sb_event_cards", JSON.stringify(appState.eventCards)); } catch (e) { }
  } catch (err) { console.error("loadEventCardsFromSupabase error:", err); }
}

export function getEventCard(groupId) {
  return appState.eventCards.find(c => c.groupId === groupId) || null;
}

export function saveEventCard(card) {
  const idx = appState.eventCards.findIndex(c => c.groupId === card.groupId);
  if (idx > -1) appState.eventCards[idx] = card; else appState.eventCards.push(card);
  try { localStorage.setItem("sb_event_cards", JSON.stringify(appState.eventCards)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('event_cards').upsert({
      group_id: card.groupId, coluna: card.coluna,
      checklist: card.checklist, lembrete: card.lembrete, updated_at: new Date().toISOString()
    }).then(({ error }) => { if (error) console.error("event_cards sync error:", error); setSyncStatus(error ? 'offline' : 'saved'); });
  }
}

export function deleteEventCard(groupId) {
  appState.eventCards = appState.eventCards.filter(c => c.groupId !== groupId);
  try { localStorage.setItem("sb_event_cards", JSON.stringify(appState.eventCards)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('event_cards').delete().eq('group_id', groupId)
      .then(({ error }) => { if (error) console.error("event_cards delete error:", error); });
  }
}

// Garante 1 card por evento (auto-criação + backfill). Idempotente.
export function ensureCardsForEvents() {
  const seen = new Set();
  (appState.events || []).forEach(e => {
    const gid = eventGroupKey(e);
    if (seen.has(gid)) return;
    seen.add(gid);
    if (!getEventCard(gid)) {
      saveEventCard({
        groupId: gid, coluna: 'todo',
        checklist: DEFAULT_CHECKLIST.map(i => ({ ...i })),
        lembrete: null
      });
    }
  });
}
