// js/auth/auth.js — login, cadastro, recuperação/redefinição de senha, logout e sessão única.

import { sbClient, captchaTokens, resetCaptcha } from '../core/supabase.js';
import { appState, clearLocalPII } from '../core/state.js';
import { friendlyAuthError } from '../utils/auth-errors.js';
import { checkLoginThrottle, recordLoginFailure, recordLoginSuccess } from './login-throttle.js';
import { fetchProfileData, roleLabelFromProfile, startSessionTokenCheck, logLogin } from '../data/profiles.repo.js';
import { applyRoleUIChanges } from '../ui/nav.js';
import { showToast, showWarningToast, showAppLoading, hideAppLoading } from '../ui/toast.js';
import { loadEventsFromSupabase } from '../data/events.repo.js';
import { loadArtistEmailsFromSupabase, loadBookerEmailsFromSupabase } from '../data/emails.repo.js';
import { loadClientsFromSupabase } from '../data/clients.repo.js';
import { loadRosterFromSupabase, backfillRosterIfEmpty } from '../data/roster.repo.js';
import { loadLogisticsFromSupabase, loadLogisticsEvents } from '../data/logistics.repo.js';
import { loadEventCardsFromSupabase, ensureCardsForEvents } from '../data/eventCards.repo.js';
import { updateDashboard } from '../features/dashboard/view.js';
import { renderEventTable } from '../features/events/table.js';
import { renderTimeline } from '../features/timeline/view.js';
import { updateConfigLists } from '../features/settings/view.js';
import { renderClientsView } from '../features/clients/view.js';
import { renderLogisticsDashboard } from '../features/logistics/view.js';
import { renderKanban } from '../features/kanban/board.js';
import { showDueReminders } from '../features/kanban/reminders.js';

export function initLogin() {
  const loginOverlay = document.getElementById("login-overlay");

  // Panels
  const pLogin = document.getElementById("panel-login");
  const pRegister = document.getElementById("panel-register");
  const pForgot = document.getElementById("panel-forgot");
  const pReset = document.getElementById("panel-reset");

  // Forms
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const forgotForm = document.getElementById("forgot-form");
  const resetForm = document.getElementById("reset-form");

  // Links
  document.getElementById("link-register").addEventListener("click", (e) => switchPanel(e, pRegister));
  document.getElementById("link-forgot-password").addEventListener("click", (e) => switchPanel(e, pForgot));
  document.getElementById("link-back-login").addEventListener("click", (e) => switchPanel(e, pLogin));
  document.getElementById("link-back-login2").addEventListener("click", (e) => switchPanel(e, pLogin));

  function switchPanel(e, targetPanel) {
    if (e) e.preventDefault();
    document.querySelectorAll(".auth-panel").forEach(p => {
      p.style.display = "none";
      p.classList.remove("active-panel");
    });
    targetPanel.style.display = "block";
    // Small timeout for fade-in effect if added to CSS
    setTimeout(() => targetPanel.classList.add("active-panel"), 10);
  }

  // --- 1. REGISTER LOGIC ---
  window.realizarCadastro = async function () {
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim().toLowerCase();
    const password = document.getElementById("reg-password").value;

    if (!name || !email || !password) {
      showToast("Por favor, preencha todos os campos.", "error");
      return;
    }

    if (password.length < 8) {
      showToast("A senha precisa ter pelo menos 8 caracteres.", "error");
      return;
    }

    if (!captchaTokens.register) {
      showWarningToast("Confirme o CAPTCHA (\"Não sou um robô\") antes de criar a conta.");
      return;
    }

    // Segurança: o PAPEL é decidido no servidor (trigger handle_new_user, que
    // consulta artist_emails/booker_emails/logistics_emails). O front não envia
    // mais role/artistProfile — user_metadata é editável pelo usuário e sempre
    // foi ignorado pelo RLS; enviar só confundia. Também removemos as listas de
    // e-mails hardcoded (exposição de PII no bundle — achado #2 da auditoria).
    const btn = registerForm.querySelector("button");
    btn.innerHTML = "Criando...";
    btn.disabled = true;

    try {
      if (!sbClient) {
        showToast("Não foi possível conectar ao servidor. Verifique sua internet ou desative o AdBlocker.", "error");
        btn.innerHTML = "Cadastrar";
        btn.disabled = false;
        return;
      }

      const { data, error } = await sbClient.auth.signUp({
        email,
        password,
        options: {
          data: { name: name },
          captchaToken: captchaTokens.register
        }
      });
      resetCaptcha("register");

      btn.innerHTML = "Cadastrar";
      btn.disabled = false;

      if (error) {
        console.error("Cadastro:", error); showToast(friendlyAuthError(error.message), "error");
      } else {
        showToast("Conta criada com sucesso! Faça login.", "success");
        registerForm.reset();
        document.querySelectorAll('.auth-panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active-panel'); });
        const pLog = document.getElementById('panel-login');
        pLog.style.display = 'block';
        setTimeout(() => pLog.classList.add('active-panel'), 10);
        document.getElementById("login-username").value = email;
      }
    } catch (err) {
      console.error("Cadastro (exceção):", err); showToast(friendlyAuthError(err.message), "error");
      btn.innerHTML = "Cadastrar";
      btn.disabled = false;
    }
  };

  // Submit do cadastro (antes vivia no boot.js como onsubmit -> window.realizarCadastro).
  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      window.realizarCadastro();
    });
  }

  // --- 2. LOGIN LOGIC ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Defesa em profundidade: freia tentativas repetidas nesta aba (a proteção
    // principal é o hCaptcha obrigatório + rate limit do Supabase). Ver login-throttle.js.
    const throttle = checkLoginThrottle();
    if (throttle.blocked) {
      const mins = Math.floor(throttle.waitSeconds / 60);
      const secs = throttle.waitSeconds % 60;
      const tempo = mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
      showWarningToast(`Muitas tentativas. Aguarde ${tempo} antes de tentar novamente.`);
      return;
    }

    const email = document.getElementById("login-username").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;

    // Login é SEMPRE por e-mail (achado SB-02 da auditoria de 29/08/2026).
    // Antes aceitava o nome artístico e resolvia via RPC resolve_login_email,
    // que precisava ser pública (roda antes do login) — qualquer pessoa
    // convertia nome artístico (público) em e-mail pessoal. A RPC foi removida
    // na migração 014; aqui só orientamos quem digitar o nome por engano.
    const loginEmail = email;
    if (!loginEmail.includes("@")) {
      showWarningToast("Entre com seu e-mail completo (não o nome do projeto).");
      return;
    }

    if (!captchaTokens.login) {
      showWarningToast("Confirme o CAPTCHA (\"Não sou um robô\") antes de entrar.");
      return;
    }

    const btn = loginForm.querySelector("button");
    btn.innerHTML = "Entrando...";
    btn.disabled = true;

    try {
      if (!sbClient) {
        showToast("Não foi possível conectar ao servidor. Recarregue a página.", "error");
        btn.innerHTML = "Entrar";
        btn.disabled = false;
        return;
      }
      const { data, error } = await sbClient.auth.signInWithPassword({
        email: loginEmail,
        password,
        options: { captchaToken: captchaTokens.login }
      });
      resetCaptcha("login");

      btn.innerHTML = "Entrar";
      btn.disabled = false;

      if (error) {
        recordLoginFailure();
        console.error("Login:", error); showToast(friendlyAuthError(error.message), "error");
      } else if (data.session) {
        recordLoginSuccess();
        const user = data.session.user;
        // Papel/nome vêm SÓ da tabela profiles (fonte de verdade, definida pelo
        // admin). Sem listas de e-mail hardcoded e sem user_metadata.role
        // (editável pelo usuário — nunca confiar).
        const profData = await fetchProfileData(user.id);
        const roleFound = roleLabelFromProfile(profData, user);

        appState.currentRole = roleFound;
        try { sessionStorage.setItem("sb_current_role", roleFound); } catch (e) { }
        applyRoleUIChanges(roleFound);

        // --- Session Token Check (tabela user_sessions — migração 008) ---
        startSessionTokenCheck(user);

        // --- Auditoria: registra o login (best-effort, não bloqueia) ---
        logLogin(user);

        loginOverlay.classList.add("hidden");

        // Carrega os eventos REAIS do banco (não re-envia dados de exemplo).
        showAppLoading();
        await loadEventsFromSupabase();
        await loadArtistEmailsFromSupabase();
        await loadBookerEmailsFromSupabase();
        await loadClientsFromSupabase();
        await loadLogisticsFromSupabase();
        await loadEventCardsFromSupabase();
        await loadLogisticsEvents();
        // Elenco/equipe/cores/metas: banco é a fonte de verdade (antes viviam só
        // no localStorage e sumiam a cada logout/deploy). Depois de carregar, o
        // backfill sobe uma única vez os dados legados que ainda estejam no
        // navegador do admin (no-op se o banco já tiver dados ou se não for admin).
        await loadRosterFromSupabase();
        await backfillRosterIfEmpty();

        updateDashboard();
        renderEventTable();
        renderTimeline();
        updateConfigLists();
        renderClientsView();
        renderLogisticsDashboard();
        ensureCardsForEvents();
        renderKanban();
        showDueReminders();
        hideAppLoading();
        showToast(`Bem-vindo, ${user.user_metadata?.name || "Usuário"}!`);
      }
    } catch (err) {
      console.error("Login (exceção):", err); showToast(friendlyAuthError(err.message), "error");
      btn.innerHTML = "Entrar";
      btn.disabled = false;
    }
  });

  // --- 3. FORGOT PASSWORD LOGIC ---
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("forgot-email").value.trim().toLowerCase();

    if (!captchaTokens.forgot) {
      showWarningToast("Confirme o CAPTCHA (\"Não sou um robô\") antes de enviar.");
      return;
    }

    const btn = document.getElementById("btn-send-otp");
    btn.innerHTML = "Enviando...";
    btn.disabled = true;
    try {
      // redirectTo brings the user back to this page with a recovery session,
      // which triggers the PASSWORD_RECOVERY event handled below.
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await sbClient.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: captchaTokens.forgot });
      resetCaptcha("forgot");
      if (error) {
        console.error("Recuperação:", error); showToast(friendlyAuthError(error.message), "error");
      } else {
        showToast("Enviamos um link de recuperação para o seu e-mail!", "success");
        switchPanel(null, pLogin);
      }
    } catch (err) {
      console.error("Recuperação (exceção):", err); showToast(friendlyAuthError(err.message), "error");
    }

    btn.innerHTML = "Enviar Link";
    btn.disabled = false;
  });

  // --- 3b. RESET PASSWORD (after clicking the e-mail recovery link) ---
  if (sbClient && resetForm) {
    // When the user returns from the recovery e-mail, Supabase emits this event.
    sbClient.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        loginOverlay.classList.remove("hidden");
        switchPanel(null, pReset);
      }
    });

    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById("reset-password").value;
      if (!newPassword || newPassword.length < 8) {
        showWarningToast("A nova senha precisa ter pelo menos 8 caracteres.");
        return;
      }
      const btn = resetForm.querySelector("button");
      btn.innerHTML = "Salvando...";
      btn.disabled = true;
      try {
        const { error } = await sbClient.auth.updateUser({ password: newPassword });
        if (error) {
          console.error("Redefinir senha:", error); showToast(friendlyAuthError(error.message), "error");
        } else {
          showToast("Senha redefinida com sucesso! Faça login com a nova senha.", "success");
          await sbClient.auth.signOut();
          switchPanel(null, pLogin);
        }
      } catch (err) {
        console.error("Redefinir senha (exceção):", err); showToast(friendlyAuthError(err.message), "error");
      }
      btn.innerHTML = "Salvar e Entrar";
      btn.disabled = false;
    });
  }

  // User Session functions
  async function handleLogout() {
    if (sbClient) {
      await sbClient.auth.signOut();
    }
    appState.currentRole = null;
    // LGPD/privacidade: NÃO regrava o cache (saveState) — em vez disso limpa o
    // PII do navegador, para não ficar legível em DevTools numa máquina
    // compartilhada após o logout. Os dados continuam seguros no Supabase.
    clearLocalPII();
    sessionStorage.removeItem("sb_current_role");
    window.location.reload();
  }

  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  // Check initial state
  if (appState.currentRole) {
    loginOverlay.classList.add("hidden");
    applyRoleUIChanges(appState.currentRole);
  }
}
