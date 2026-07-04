// data/profiles.repo.js — perfil do usuário, sessão única e log de login.
import { sbClient, dbg } from '../core/supabase.js';
import { showWarningToast } from '../ui/toast.js';

// Lê papel/nome do artista do usuário logado na tabela profiles (fonte de verdade).
export async function fetchProfileData(userId) {
  if (!sbClient || !userId) return null;
  try {
    const { data, error } = await sbClient.from('profiles').select('role, artist_name').eq('id', userId).single();
    if (error) return null;
    return data ? data : null;
  } catch (e) { return null; }
}

// Monta o rótulo de papel exibido na UI a partir do profile (fonte de verdade:
// a tabela profiles, definida pelo admin). NÃO usa listas de e-mail no front —
// o RLS é o portão real; isto é só apresentação.
export function roleLabelFromProfile(profData, user) {
  const metaName = user && user.user_metadata ? user.user_metadata.name : null;
  if (profData && profData.role === "Logistica") return `${metaName || "Logística"} (Logística)`;
  if (profData && profData.role === "Booker") return `${profData.artist_name || metaName || "Booker"} (Booker)`;
  if (profData && profData.role === "Admin") return `${metaName || "Admin"} (Admin)`;
  return `${(profData && profData.artist_name) || metaName || "Artista"} (Artista)`;
}

let sessionCheckInterval = null;

// Lê o token de sessão vigente na tabela user_sessions (RLS: só a própria linha).
async function fetchSessionToken(userId) {
  const { data, error } = await sbClient
    .from('user_sessions').select('session_token').eq('user_id', userId).maybeSingle();
  if (error) return { token: null, unavailable: true };
  return { token: data ? data.session_token : null, unavailable: false };
}

// Sessão única: registra um token e desconecta se outro dispositivo assumir.
// Usa a tabela user_sessions (migração 008) — a RLS de profiles bloqueava o
// update de session_token para não-admins e o controle falhava em silêncio.
export async function startSessionTokenCheck(user) {
  if (!sbClient) return;

  let myToken = localStorage.getItem("sb_session_token");
  if (!myToken) {
    myToken = crypto.randomUUID();
    localStorage.setItem("sb_session_token", myToken);
  }

  // Este dispositivo assume a sessão. IMPORTANTE: verificar o erro — antes a
  // falha era silenciosa e a "sessão única" não funcionava para não-admins.
  const { error } = await sbClient.from("user_sessions").upsert({
    user_id: user.id,
    session_token: myToken,
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.error("Sessão única indisponível (migração 008 já rodou?):", error.message);
    return; // não agenda a checagem com um controle que não está gravando
  }

  if (sessionCheckInterval) clearInterval(sessionCheckInterval);

  sessionCheckInterval = setInterval(async () => {
    try {
      const { token, unavailable } = await fetchSessionToken(user.id);
      if (!unavailable && token && token !== myToken) {
        clearInterval(sessionCheckInterval);
        await sbClient.auth.signOut();
 