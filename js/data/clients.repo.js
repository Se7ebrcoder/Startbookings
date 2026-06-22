// data/clients.repo.js — leitura/gravação de clientes no Supabase.
import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';
import { setSyncStatus } from '../ui/toast.js';

export async function loadClientsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data, error } = await fetchAllRows('clients', 'id');
    if (error) { console.error("Supabase clients fetch error:", error); return; }
    appState.clients = (data || []).map(c => ({
      id: c.id,
      name: c.name || "",
      contact: c.contact || ""
    }));
    try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) { }
  } catch (err) {
    console.error("loadClientsFromSupabase error:", err);
  }
}

// Retorna o nome do cliente a partir do id (ou "—").
export function getClientName(clientId) {
  const c = appState.clients.find(cl => cl.id === clientId);
  return c ? c.name : "—";
}

// Cria/atualiza um cliente no estado e sincroniza com o Supabase.
export function saveClientToSupabase(client) {
  const idx = appState.clients.findIndex(c => c.id === client.id);
  if (idx > -1) appState.clients[idx] = client;
  else appState.clients.push(client);
  try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('clients').upsert({ id: client.id, name: client.name, contact: client.contact || "" })
      .then(({ error }) => { if (error) console.error("Supabase client sync error:", error); setSyncStatus(error ? 'offline' : 'saved'); });
  }
}

// Remove um cliente do estado e do Supabase (sem validação/UI — isso fica na feature).
export function deleteClientFromSupabase(clientId) {
  appState.clients = appState.clients.filter(c => c.id !== clientId);
  try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('clients').delete().eq('id', clientId)
      .then(({ error }) => { if (error) console.error("Supabase client delete error:", error); });
  }
}
