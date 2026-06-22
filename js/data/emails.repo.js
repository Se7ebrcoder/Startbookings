// data/emails.repo.js — mapa e-mail→artista (artist_emails) no Supabase.
import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';

export async function loadArtistEmailsFromSupabase() {
  if (!sbClient) return;
  try {
    // Mapeamentos padrão que devem existir online.
    const defaultEmails = {
      "raianlameira@hotmail.com": "Se7e",
      "contato.anotherreality@gmail.com": "Another Reality",
      "parallelusmusic@gmail.com": "Parallelus",
      "atomuz_@outlook.com": "Atomuz",
      "contatoartisticope@gmail.com": "Bug System",
      "giuseppebandini36@gmail.com": "Bandini",
      "gabrielramos0420@gmail.com": "Invader Space",
      "oliveira.lay12@gmail.com": "Shuri"
    };

    if (!appState.artistEmails) appState.artistEmails = {};
    for (const [email, artist] of Object.entries(defaultEmails)) {
      if (!appState.artistEmails[email]) {
        appState.artistEmails[email] = artist;
      }
    }

    const { data, error } = await fetchAllRows('artist_emails', 'email');

    let dbEmails = [];
    if (!error && data && data.length > 0) {
      data.forEach(item => {
        appState.artistEmails[item.email] = item.artist_name;
        dbEmails.push(item.email);
      });
    }

    // Admin: envia para a nuvem os e-mails padrões que estiverem faltando.
    if (!error && appState.currentRole && appState.currentRole.includes("Admin")) {
      for (const [email, artist] of Object.entries(defaultEmails)) {
        if (!dbEmails.includes(email)) {
          sbClient.from('artist_emails').upsert({ email: email, artist_name: artist }).then(() => { });
        }
      }
    }

    try { localStorage.setItem("sb_artistEmails", JSON.stringify(appState.artistEmails)); } catch (e) { }
  } catch (err) { }
}
