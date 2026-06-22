// js/ui/nav.js — navegação SPA, permissões de UI por papel e filtro de eventos.

import { appState } from '../core/state.js';
import { updateDashboard } from '../features/dashboard/view.js';
import { updateDropdownOptions, renderEventTable } from '../features/events/table.js';
import { renderTimeline } from '../features/timeline/view.js';
import { updateConfigLists } from '../features/settings/view.js';
import { renderClientsView } from '../features/clients/view.js';
import { renderLogisticsDashboard } from '../features/logistics/view.js';
import { renderFinanceiroView } from '../features/finance/view.js';
import { renderKanban } from '../features/kanban/board.js';
import { showDueReminders } from '../features/kanban/reminders.js';

export function applyRoleUIChanges(role) {
  if (!role) return;
  const isLogistics = role.includes("(Logística)");
  document.body.classList.toggle("role-logistica", isLogistics);
  const isArtist = role === "Artista" || role.includes("(Artista)");
  const name = role.split(" (")[0];
  const roleType = (role === "Admin" || role.includes("(Admin)")) ? "Administrador" : (role.includes("(Booker)") ? "Booker" : (role.includes("(Gerente)") ? "Gerente" : "Artista"));

  // Update sidebar profile card
  const avatarEl = document.getElementById("sidebar-user-avatar");
  const nameEl = document.getElementById("sidebar-user-name");
  const roleEl = document.getElementById("sidebar-user-role");

  if (avatarEl) avatarEl.textContent = name.charAt(0);
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = roleType;

  // Show/Hide actions
  const addShowBtn = document.getElementById("open-new-event-btn");
  const actionsHeaders = document.querySelectorAll(".actions-header-column");

  const addArtistForm = document.getElementById("add-artist-form");
  const addSellerForm = document.getElementById("add-seller-form");

  if (isArtist) {
    document.body.classList.add("role-artist");
    if (addShowBtn) addShowBtn.style.display = "none";
    actionsHeaders.forEach(el => el.style.display = "none");
    if (addArtistForm) addArtistForm.style.display = "none";
    if (addSellerForm) addSellerForm.style.display = "none";
  } else {
    document.body.classList.remove("role-artist");
    if (addShowBtn) addShowBtn.style.display = "flex";
    actionsHeaders.forEach(el => el.style.display = "table-cell");
    if (addArtistForm) addArtistForm.style.display = "block";
    if (addSellerForm) addSellerForm.style.display = "block";
  }

  // Custom navigation permissions
  const navSettings = document.getElementById("nav-settings-item");
  const navTimeline = document.querySelector('[data-view="timeline"]')?.parentElement;
  const navFinanceiro = document.getElementById("nav-financeiro-item");
  const navKanban = document.getElementById("nav-kanban-item");

  if (roleType === "Administrador") {
    if (navSettings) navSettings.style.display = "block";
    if (navTimeline) navTimeline.style.display = "block";
    if (navFinanceiro) navFinanceiro.style.display = "block";
    if (navKanban) navKanban.style.display = "block";
  } else {
    if (navFinanceiro) navFinanceiro.style.display = "none";
    if (navKanban) navKanban.style.display = "none";
    if (roleType === "Booker") {
      if (navSettings) navSettings.style.display = "none";
      if (navTimeline) navTimeline.style.display = "none";
    }
  }
}

// Helper to filter events based on current active role
export function getFilteredEvents() {
  const role = appState.currentRole;
  if (!role) return []; // Return empty if not logged in

  if (role.includes("(Artista)")) {
    // Artist sees only their own events
    const artistName = role.split(" (")[0];
    return appState.events.filter(e => e.artist === artistName);
  } else if (role.includes("(Booker)")) {
    // Booker sees only events where they are the seller
    const bookerName = role.split(" (")[0];
    return appState.events.filter(e => e.vendedor === bookerName);
  } else {
    // Admin and Manager see all events
    return appState.events;
  }
}

// 2. SPA NAVIGATION
export function initNavigation() {
  const menuItems = document.querySelectorAll(".menu-item");
  const views = document.querySelectorAll(".view-section");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");

  const subtitles = {
    dashboard: "Visão geral do faturamento, metas e gráficos de lançamentos.",
    table: "Lista detalhada de eventos, lançamentos e status de negociação.",
    timeline: "Linha do tempo cronológica da carreira e marcos dos projetos.",
    bot: "Converse com o assistente StartBot para cadastrar novos eventos via texto.",
    kanban: "Quadro interativo para acompanhamento visual de tarefas e processos.",
    settings: "Configuração de metas anuais e gerenciamento de artistas e equipe.",
    clients: "Catálogo de clientes/promotores e o histórico de produções de cada um.",
    logistics: "Roteiros de viagem dos artistas: status, prazos e itinerários.",
    financeiro: "Valores de logística por artista; refletem no total dos eventos."
  };

  const titles = {
    dashboard: "Dashboard",
    table: "Tabela de Eventos",
    timeline: "Linha do tempo",
    bot: "Assistente StartBot",
    kanban: "Kanban de Tarefas",
    settings: "Configurações",
    clients: "Clientes",
    logistics: "Logística",
    financeiro: "Financeiro"
  };

  function switchView(targetView) {
    // Update active link
    menuItems.forEach(i => {
      i.classList.remove("active");
      if (i.getAttribute("data-view") === targetView) {
        i.classList.add("active");
      }
    });

    // Update active view
    views.forEach(view => {
      view.classList.remove("active-view");
      if (view.id === `${targetView}-view`) {
        view.classList.add("active-view");
      }
    });

    // Update titles
    if (titles[targetView]) {
      pageTitle.textContent = titles[targetView];
      pageSubtitle.textContent = subtitles[targetView];
    }

    // Refresh views specific actions
    if (targetView === "dashboard") {
      updateDashboard();
    } else if (targetView === "table") {
      updateDropdownOptions();
      renderEventTable();
    } else if (targetView === "timeline") {
      updateDropdownOptions();
      renderTimeline();
    } else if (targetView === "settings") {
      updateConfigLists();
    } else if (targetView === "clients") {
      renderClientsView();
    } else if (targetView === "logistics") {
      renderLogisticsDashboard();
    } else if (targetView === "financeiro") {
      renderFinanceiroView();
    } else if (targetView === "kanban") {
      renderKanban();
      showDueReminders();
    }

    // Save to localStorage
    localStorage.setItem("sb_current_view", targetView);
  }

  // --- Mobile drawer (hamburger) ---
  const menuToggleBtn = document.getElementById("menu-toggle-btn");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");

  function openSidebar() {
    document.body.classList.add("sidebar-open");
    if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", "false");
  }
  if (menuToggleBtn) {
    menuToggleBtn.addEventListener("click", () => {
      if (document.body.classList.contains("sidebar-open")) closeSidebar();
      else openSidebar();
    });
  }
  if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });

  function activateItem(item) {
    const targetView = item.getAttribute("data-view");
    switchView(targetView);
    closeSidebar(); // close the drawer after navigating on mobile
  }

  menuItems.forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      activateItem(item);
    });
    // Keyboard accessibility: the menu items are <a> without href
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateItem(item);
      }
    });
  });

  // Restore last view on load
  const lastView = localStorage.getItem("sb_current_view") || "dashboard";
  switchView(lastView);
}
