// js/main.js — ponto de entrada: importa, inicializa no DOMContentLoaded e faz o boot de sessão.

import { onHcaptchaLoad, sbClient, dbg } from './core/supabase.js';
import { appState, loadState } from './core/state.js';
import { initLogin } from './auth/auth.js';
import { initNavigation, applyRoleUIChanges } from './ui/nav.js';
import { initModalA11y } from './ui/modal.js';
import { initTableSorting, initTableFilters, renderEventTable } from './features/events/table.js';
import { initEventModal } from './features/events/modal.js';
import { initSettings, initColorPicker, updateConfigLists } from './features/settings/view.js';
import { initClientModule } from './features/clients/modal.js';
import { renderClientsView } from './features/clients/view.js';
import { initLogisticsModule } from './features/logistics/form.js';
import { renderLogisticsDashboard } from './features/logistics/view.js';
import { initKanban, renderKanban } from './features/kanban/board.js';
import { initEventCardModal } from './features/kanban/card-modal.js';
import { showDueReminders } from './features/kanban/reminders.js';
import { initFinanceiro } from './features/finance/view.js';
import { updateDashboard } from './features/dashboard/view.js';
import { renderTimeline } from './features/timeline/view.js';
import { fetchProfileData, roleLabelFromProfile, startSessionTokenCheck } from './data/profiles.repo.js';
import { loadEventsFromSupabase } from './data/events.repo.js';
import { loadArtistEmailsFromSupabase, loadBookerEmailsFromSupabase } from './data/emails.repo.js';
import { loadClientsFromSupabase } from './data/clients.repo.js';
import { loadLogisticsFromSupabase, loadLogisticsEvents } from './data/logistics.repo.js';
import { loadEventCardsFromSupabase, ensureCardsForEvents } from './data/eventCards.repo.js';
import { showAppLoading, hideAppLoading } from './ui/toast.js';

// Bridge para o callback do script do hCaptcha (carregado como <script> clássico).
window.onHcaptchaLoad = onHcaptchaLoad;

document.addEventListener("DOMContentLoaded", async () => {
  loadState();

  initLogin();
  initNavigation();
  initTableSorting();
  initTableFilters();
  initEventModal();
  initSettings();
  initColorPicker();
  initClientModule();
  initLogisticsModule();
  initKanban();
  initFinanceiro();
  initModalA11y();
  initEventCardModal();

  // Try to load auth state from Supabase
  if (sbClient) {
    try {
      const { data: { session } } = await sbClient.auth.getSession();
      if (session) {
        dbg("Usuário já está logado via Supabase:", session.user.email);
        const user = session.user;
        // Papel/nome vêm SÓ da tabela profiles (fonte de verdade) — sem listas
        // de e-mail hardcoded no bundle (achado #2 da auditoria).
        const profData = await fetchProfileData(user.id);
        const roleFound = roleLabelFromProfile(profData, user);
        appState.currentRole = roleFound;
        try { sessionStorage.setItem("sb_current_role", roleFound); } catch (e) { }
        applyRoleUIChanges(roleFound);

        // --- Session Token Check (tabela user_sessions — migração 008) ---
        startSessionTokenCheck(user);

        document.getElementById("login-overlay").classList.add("hidden");

        // O banco é a fonte de verdade: carrega os eventos de lá.
        showAppLoading();
        await loadEventsFromSupabase();
        await loadArtistEmailsFromSupabase();
        await loadBookerEmailsFromSupabase();
        await loadClientsFromSupabase();
        await loadLogisticsFromSupabase();
        await loadEventCardsFromSupabase();
        await loadLogisticsEvents();

        const loginOverlay = document.getElementById("login-overlay");
        if (loginOverlay) loginOverlay.classList.add("hidden");

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
      }
    } catch (err) {
      console.error("Supabase getSession error:", err);
    }
  }
});
