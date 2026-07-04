// data/emails.repo.js — mapa e-mail→artista (artist_emails) no Supabase.
import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';

// Segurança/LGPD: sem lista padrão hardcoded (achado #2 da auditoria) — o
// banco (artist_emails, RLS: só admin lê) é a única fonte. Para não-admins a
// consulta volta vazia e o mapa fica vazio, o que é o comportamento correto.
export async function loadArtistEmailsFromSupabase() {
  if (!sbClient) return;
  try {
    if (!appState.artistEmails) appState.artistEmails = {};

    const { data, error } = await fetchAllRows('artist_emails', 'email');
    if (!error && data && data.length > 0) {
      data.forEach(item => {
        appState.artistEmails[item.email] = item.artist_name;
      });
    }

    try { localStorage.setItem("sb_artistEmails", JSON.stringify(appState.artistEmails)); } catch (e) { }
  } catch (err) { }
}

// Mapa e-mail→booker (booker_emails). RLS: só admin lê — para os demais volta
// vazio. Alimenta a lista "Gerenciar Equipe" nas Configurações.
export async function loadBookerEmailsFromSupabase() {
  if (!sbClient) return;
  try {
    if (!appState.bookerEmails) appState.bookerEmails = {};

    const { data, error } = await fetchAllRows('booker_emails', 'email');
    if (!error && data && data.length > 0) {
      data.forEach(item => {
        appState.bookerEmails[item.email] = item.booker_name;
      });
    }

    try { localStorage.setItem("sb_bookerEmails", JSON.stringify(appState.bookerEmails)); } catch (e) { }
  } catch (err) { }
}
