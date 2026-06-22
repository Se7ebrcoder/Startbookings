// data/events.repo.js — leitura/gravação de eventos no Supabase.
import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';
import { getRandomColor } from '../utils/dom.js';
import { setSyncStatus } from '../ui/toast.js';

// Injeção do "refresher" de dropdowns (definido pela feature de eventos via
// main.js), para a camada data/ não importar de features/.
let _dropdownRefresher = null;
export function setDropdownRefresher(fn) { _dropdownRefresher = fn; }

// Carrega os eventos do Supabase para o appState (substitui o local).
export async function loadEventsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data: dbEvents, error } = await fetchAllRows('events', 'id');
    if (error) {
      console.error("Supabase fetch error:", error);
      return;
    }
    appState.events = (dbEvents || []).map(dbEv => ({
      id: dbEv.id,
      groupId: dbEv.group_id,
      event: dbEv.event_name,
      date: dbEv.event_date,
      venue: dbEv.venue || "",
      estado: dbEv.estado || "",
      artist: dbEv.artist || "",
      vendedor: dbEv.vendedor || "",
      status: dbEv.status || "antes",
      amount: dbEv.amount || 0,
      financeNotes: dbEv.finance_notes || "",
      clientId: dbEv.client_id || "cli-a-definir",
      contractStatus: dbEv.contract_status || "pendente"
    }));

    // Sincroniza artistas e vendedores do banco para o estado local, evitando que "sumam"
    let updatedConfig = false;
    appState.events.forEach(e => {
      if (e.artist && !appState.artists.includes(e.artist)) {
        appState.artists.push(e.artist);
        appState.tagColors[e.artist] = getRandomColor();
        updatedConfig = true;
      }
      if (e.vendedor && !appState.sellers.includes(e.vendedor)) {
        appState.sellers.push(e.vendedor);
        appState.tagColors[e.vendedor] = getRandomColor();
        updatedConfig = true;
      }
    });

    try {
      localStorage.setItem("sb_events", JSON.stringify(appState.events));
      if (updatedConfig) {
        localStorage.setItem("sb_artists", JSON.stringify(appState.artists));
        localStorage.setItem("sb_sellers", JSON.stringify(appState.sellers));
        localStorage.setItem("sb_tagColors", JSON.stringify(appState.tagColors));
        if (typeof _dropdownRefresher === 'function') _dropdownRefresher();
      }
    } catch (e) { }
  } catch (err) {
    console.error("loadEventsFromSupabase error:", err);
  }
}

// Sincroniza todos os eventos com o Supabase (upsert em segundo plano).
// Extraído do saveState() do monólito.
export function syncEventsToSupabase(events) {
  if (!events || events.length === 0) return;
  const mappedEvents = events.map(ev => ({
    id: ev.id,
    group_id: ev.groupId || ev.id,
    event_name: ev.event,
    event_date: ev.date,
    venue: ev.venue || null,
    estado: ev.estado || "",
    artist: ev.artist || "",
    vendedor: ev.vendedor || "",
    status: ev.status || 'antes',
    amount: ev.amount || 0,
    finance_notes: ev.financeNotes || "",
    client_id: ev.clientId || "cli-a-definir",
    contract_status: ev.contractStatus || "pendente"
  }));
  if (sbClient) {
    sbClient.from('events').upsert(mappedEvents).then(({ error }) => {
      if (error) console.error("Supabase Sync Error:", error);
      setSyncStatus(error ? 'offline' : 'saved');
    });
  } else {
    console.warn("Supabase script not loaded. Saving locally only.");
  }
}

// Exclui um evento (linha) do Supabase. Extraído do deleteEvent() do monólito.
export function deleteEventFromSupabase(id) {
  if (appState.currentRole && sbClient) {
    sbClient.from('events').delete().eq('id', id).then(({ error }) => {
      if (error) console.error("Error deleting from Supabase", error);
    });
  }
}
