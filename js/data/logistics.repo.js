// data/logistics.repo.js — leitura/gravação de logística no Supabase.
import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';
import { setSyncStatus } from '../ui/toast.js';
import { deriveLogisticsStatus } from '../utils/domain.js';
import { newId } from '../utils/id.js';

export async function loadLogisticsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data, error } = await fetchAllRows('logistics', 'id');
    if (error) { console.error("Supabase logistics fetch error:", error); return; }
    appState.logistics = (data || []).map(r => ({
      id: r.id,
      eventKey: r.event_key,
      eventDate: r.event_date,
      artist: r.artist,
      groupId: r.group_id,
      status: r.status || 'andamento',
      data: r.data || {}
    }));
    try { localStorage.setItem("sb_logistics", JSON.stringify(appState.logistics)); } catch (e) { }
  } catch (err) { console.error("loadLogisticsFromSupabase error:", err); }
}

// Carrega os eventos (sem financeiro) via RPC segura, para o dashboard/cascata.
export async function loadLogisticsEvents() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.rpc('logistics_events');
    if (error) { console.error("logistics_events RPC error:", error); return; }
    appState.logisticsEvents = (data || []).map(e => ({
      groupId: e.group_id,
      eventName: e.event_name,
      eventDate: e.event_date,
      venue: e.venue || "",
      estado: e.estado || "",
      artist: e.artist || ""
    }));
  } catch (err) { console.error("loadLogisticsEvents error:", err); }
}

export function getLogisticsRecord(eventKey, artist) {
  return appState.logistics.find(r => r.eventKey === eventKey && r.artist === artist) || null;
}

export function getArtistLogisticsStatus(eventKey, artist) {
  return deriveLogisticsStatus(getLogisticsRecord(eventKey, artist));
}

// Cria/atualiza uma logística no estado e no Supabase.
export function saveLogistics(record) {
  const idx = appState.logistics.findIndex(r => r.id === record.id);
  if (idx > -1) appState.logistics[idx] = record;
  else appState.logistics.push(record);
  try { localStorage.setItem("sb_logistics", JSON.stringify(appState.logistics)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('logistics').upsert({
      id: record.id, event_key: record.eventKey, event_date: record.eventDate,
      artist: record.artist, group_id: record.groupId, status: record.status, data: record.data
    }).then(({ error }) => { if (error) console.error("Supabase logistics sync error:", error); setSyncStatus(error ? 'offline' : 'saved'); });
  }
}

// Retorna o registro de logística de um artista no evento, criando um vazio
// se ainda não existir (usado p/ edição rápida pelo card do Kanban).
export function getOrCreateLogistics(groupId, artist, eventDate) {
  let rec = getLogisticsRecord(groupId || "", artist);
  if (rec) {
    rec.data = rec.data || {};
    return rec;
  }
  rec = {
    id: newId("log"),
    eventKey: groupId || "",
    eventDate: eventDate || null,
    artist: artist,
    groupId: groupId || "",
    status: "andamento",
    data: { temHospedagem: false, hotel: null, ida: {}, volta: {} }
  };
  return rec;
}
