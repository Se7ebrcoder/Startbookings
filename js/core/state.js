// core/state.js — estado em memória (appState), persistência local e helpers.
import { DEFAULT_ARTISTS, DEFAULT_SELLERS, DEFAULT_GOAL, DEFAULT_EVENTS, SB_DATA_VERSION } from './config.js';
import { syncEventsToSupabase } from '../data/events.repo.js';

export const appState = {
  artists: DEFAULT_ARTISTS,
  sellers: DEFAULT_SELLERS,
  goal: DEFAULT_GOAL,
  events: DEFAULT_EVENTS,
  clients: [],
  logistics: [],
  eventCards: [],
  logisticsEvents: [],
  currentRole: null,
  users: null,
  tagColors: {},
  // Segurança/LGPD: SEM e-mails hardcoded no bundle (achado #2 da auditoria).
  // Os mapas são preenchidos pós-login a partir do banco (RLS: só admin lê
  // artist_emails/booker_emails). O login é sempre por e-mail (a RPC de login
  // por nome foi removida na migração 014 — expunha e-mails a anônimos).
  artistEmails: {},
  adminEmails: {},
  bookerEmails: {}
};

// Globais de ordenação/abas e instâncias de gráficos (reatribuídos via setters,
// pois bindings de import são somente-leitura fora do módulo de origem).
export let currentSortColumn = "date";
export let currentSortOrder = "asc";
export let currentActiveEventGroup = null;
export let monthlyChart = null;
export let statusDoughnutChart = null;
export function setSortColumn(c) { currentSortColumn = c; }
export function setSortOrder(o) { currentSortOrder = o; }
export function setActiveEventGroup(g) { currentActiveEventGroup = g; }
export function setMonthlyChart(c) { monthlyChart = c; }
export function setStatusDoughnutChart(c) { statusDoughnutChart = c; }

// Carrega o estado do localStorage para appState (chamado no boot).
export function loadState() {
  // Limpeza única dos dados-fantasma de versões antigas.
  try {
    if (localStorage.getItem("sb_data_version") !== SB_DATA_VERSION) {
      ["sb_events", "sb_artists", "sb_sellers", "sb_tagColors"].forEach(k => localStorage.removeItem(k));
      localStorage.setItem("sb_data_version", SB_DATA_VERSION);
    }
  } catch (err) {
    console.error("Storage cleanup error:", err);
  }

  try {
    appState.artists = JSON.parse(localStorage.getItem("sb_artists")) || DEFAULT_ARTISTS;
    appState.sellers = JSON.parse(localStorage.getItem("sb_sellers")) || DEFAULT_SELLERS;
    appState.goals = JSON.parse(localStorage.getItem("sb_goals")) || {};
    if (localStorage.getItem("sb_goal") && Object.keys(appState.goals).length === 0) {
      appState.goals["Admin"] = parseFloat(localStorage.getItem("sb_goal")) || 500000;
    }
    appState.events = JSON.parse(localStorage.getItem("sb_events")) || DEFAULT_EVENTS;
    appState.clients = JSON.parse(localStorage.getItem("sb_clients")) || [];
    appState.logistics = JSON.parse(localStorage.getItem("sb_logistics")) || [];
    appState.eventCards = JSON.parse(localStorage.getItem("sb_event_cards")) || [];
    try { localStorage.removeItem("sb_kanban"); } catch (e) { }
    appState.currentRole = sessionStorage.getItem("sb_current_role") || null;
    appState.users = JSON.parse(localStorage.getItem("sb_users")) || null;
    appState.tagColors = JSON.parse(localStorage.getItem("sb_tagColors")) || {};
    // Sem defaults hardcoded (PII) — o cache local só existe após um login
    // que carregou os mapas do banco (e é apagado no logout via clearLocalPII).
    appState.artistEmails = JSON.parse(localStorage.getItem("sb_artistEmails")) || {};
    appState.adminEmails = JSON.parse(localStorage.getItem("sb_adminEmails")) || {};
    appState.bookerEmails = JSON.parse(localStorage.getItem("sb_bookerEmails")) || {};
  } catch (err) {
    console.error("Storage error:", err);
  }
}

// LGPD/privacidade: remove do navegador (localStorage) os dados pessoais e
// operacionais em cache. Chamado no logout para que nada de PII fique legível
// numa máquina compartilhada. Os dados continuam no Supabase, protegidos por RLS.
export function clearLocalPII() {
  const keys = [
    "sb_events", "sb_clients", "sb_logistics", "sb_event_cards",
    "sb_logisticsEvents", "sb_artistEmails", "sb_adminEmails", "sb_users",
    "sb_artists", "sb_sellers", "sb_tagColors", "sb_goals", "sb_session_token"
  ];
  keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
}

// Salva o estado no localStorage e dispara a sincronização de eventos (data/).
export function saveState() {
  appState.logisticsEvents = (appState.events || []).map(ev => ({
    groupId: ev.groupId || ev.id,
    eventName: ev.event,
    eventDate: ev.date,
    venue: ev.venue || "",
    estado: ev.estado || "",
    artist: ev.artist || ""
  }));

  localStorage.setItem("sb_artists", JSON.stringify(appState.artists));
  localStorage.setItem("sb_sellers", JSON.stringify(appState.sellers));
  localStorage.setItem("sb_goals", JSON.stringify(appState.goals));
  localStorage.setItem("sb_events", JSON.stringify(appState.events));
  localStorage.setItem("sb_clients", JSON.stringify(appState.clients));
  localStorage.setItem("sb_logistics", JSON.stringify(appState.logistics));
  localStorage.setItem("sb_users", JSON.stringify(appState.users));
  localStorage.setItem("sb_tagColors", JSON.stringify(appState.tagColors));
  localStorage.setItem("sb_artistEmails", JSON.stringify(appState.artistEmails));
  localStorage.setItem("sb_adminEmails", JSON.stringify(appState.adminEmails));

  if (appState.currentRole) {
    sessionStorage.setItem("sb_current_role", appState.currentRole);
    // Sincroniza eventos com o Supabase em segundo plano (camada data/).
    syncEventsToSupabase(appState.events);
  } else {
    sessionStorage.removeItem("sb_current_role");
  }
}
