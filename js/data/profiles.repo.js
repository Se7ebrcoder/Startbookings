// data/profiles.repo.js — perfil do usuário, sessão única e log de login.
import { sbClient, dbg } from '../core/supabase.js';
import { showWarningToast } from '../ui/toast.js';

// Lê papel/nome do artista do usuário logado na tabela profiles (fonte de verdade).
export async function fetchProfileData(userId) {
  if (!sbClient || !userId) return null;
  try {
    const { data, error } = await sbClient.from('profiles').select('role, artist_name, session_token').eq('id', userId).single();
    if (error) return null;
    return data ? data : null;
  } catch (e) { return null; }
}

let sessionCheckInterval = null;

// Sessão única: registra um token e desconecta se outro dispositivo assumir.
export async function startSessionTokenCheck(user, profData) {
  if (!sbClient) return;

  let myToken = localStorage.getItem("sb_session_token");
  let dbToken = profData ? profData.session_token : null;

  if (!myToken) {
    myToken = crypto.randomUUID();
    localStorage.setItem("sb_session_token", myToken);
    await sbClient.from("profiles").update({ session_token: myToken }).eq("id", user.id);
  } else if (!dbToken || dbToken !== myToken) {
    await sbClient.from("profiles").update({ session_token: myToken }).eq("id", user.id);
  }

  if (sessionCheckInterval) clearInterval(sessionCheckInterval);

  sessionCheckInterval = setInterval(async () => {
    try {
      const pData = await fetchProfileData(user.id);
      if (pData && pData.session_token && pData.session_token !== myToken) {
        clearInterval(sessionCheckInterval);
        await sbClient.auth.signOut();
        try { showWarningToast("Sua conta foi conectada em outro dispositivo.\nVocê foi desconectado deste."); } catch (e) { }
        setTimeout(() => window.location.reload(), 2500);
      }
    } catch (e) { console.error("Session check error", e); }
  }, 30000); // Verify every 30s
}

// Registra o login na tabela login_logs (auditoria). Best-effort: falha silenciosa.
export async function logLogin(user) {
  if (!sbClient || !user) return;
  try {
    await sbClient.from("login_logs").insert({
      user_id: user.id,
      email: (user.email || "").toLowerCase(),
      user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 300)
    });
  } catch (e) { dbg("logLogin falhou (ignorado):", e); }
}
