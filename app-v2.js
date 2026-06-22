// StartBooking Career Management Logic

// Debug logs informativos só quando ?debug=1 na URL ou localStorage.sb_debug="1".
// Em produção fica desligado — evita vazar dados (ex.: e-mail) no console.
const SB_DEBUG = (function () {
  try {
    return (typeof location !== "undefined" && /[?&]debug=1\b/.test(location.search))
      || (typeof localStorage !== "undefined" && localStorage.getItem("sb_debug") === "1");
  } catch (e) { return false; }
})();
function dbg() { if (SB_DEBUG) console.log.apply(console, arguments); }

window.onerror = function (msg, url, line) {
  console.error("SB error:", msg, "at", url, "line", line);
};
window.onunhandledrejection = function (event) {
  console.error("SB unhandled rejection:", event.reason);
};

// --- SUPABASE INITIALIZATION ---
// Chave PUBLISHABLE (segura para o navegador quando o RLS está ativo).
// Substituiu a antiga chave anon (JWT legado) que havia vazado.
const supabaseUrl = 'https://jijjacpgbnubamawbscw.supabase.co';
const supabaseKey = 'sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_';
let sbClient = null;
try {
  if (window.supabase) {
    sbClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: window.sessionStorage
      }
    });
  } else {
    console.error("Supabase script not loaded!");
  }
} catch (err) {
  console.error("Supabase init error:", err);
}

// --- hCAPTCHA (proteção contra bots no login/cadastro/recuperação) ---
// A "site key" é PÚBLICA (aparece na página) — copie-a do painel do hCaptcha.com → Sites,
// ou da tela do Supabase (Authentication → Attack Protection) onde você ativou o CAPTCHA.
const HCAPTCHA_SITEKEY = "b13a8788-f1ca-45a0-bfac-9cf82c429118";
const captchaTokens = { login: null, register: null, forgot: null };
const captchaWidgets = {};
// O script do hCaptcha chama esta função quando termina de carregar (render=explicit).
window.onHcaptchaLoad = function () {
  if (!window.hcaptcha) return;
  ["login", "register", "forgot"].forEach((key) => {
    const el = document.getElementById("captcha-" + key);
    if (!el || captchaWidgets[key] !== undefined) return;
    try {
      captchaWidgets[key] = window.hcaptcha.render(el, {
        sitekey: HCAPTCHA_SITEKEY,
        callback: (token) => { captchaTokens[key] = token; },
        "expired-callback": () => { captchaTokens[key] = null; },
        "error-callback": () => { captchaTokens[key] = null; }
      });
    } catch (e) {
      console.error("Falha ao renderizar hCaptcha (" + key + "):", e);
    }
  });
};
// Limpa o widget após uma tentativa (o token do hCaptcha é de uso único).
function resetCaptcha(key) {
  captchaTokens[key] = null;
  if (window.hcaptcha && captchaWidgets[key] !== undefined) {
    try { window.hcaptcha.reset(captchaWidgets[key]); } catch (e) { }
  }
}
// Se o hCaptcha já tiver carregado antes deste script (corrida de carregamento),
// o onload pode ter disparado sem a função existir — então renderiza agora.
if (window.hcaptcha && window.hcaptcha.render) {
  window.onHcaptchaLoad();
}

// Default Mock Data if LocalStorage is empty
// Sem dados de exemplo: o app começa vazio e usa o Supabase como fonte de verdade.
const DEFAULT_ARTISTS = [];
const DEFAULT_SELLERS = [];
const DEFAULT_GOAL = 3500000;
const DEFAULT_EVENTS = [];

// Limpeza única dos dados-fantasma (eventos/artistas de exemplo) que versões
// antigas deixaram no localStorage deste navegador/origem.
const SB_DATA_VERSION = "4";
try {
  if (localStorage.getItem("sb_data_version") !== SB_DATA_VERSION) {
    ["sb_events", "sb_artists", "sb_sellers", "sb_tagColors"].forEach(k => localStorage.removeItem(k));
    localStorage.setItem("sb_data_version", SB_DATA_VERSION);
  }
} catch (err) {
  console.error("Storage cleanup error:", err);
}

// Load State from LocalStorage Safely
let appState = {
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
  artistEmails: {
    "raianlameira@hotmail.com": "Se7e",
    "contato.anotherreality@gmail.com": "Another Reality",
    "parallelusmusic@gmail.com": "Parallelus",
    "atomuz_@outlook.com": "Atomuz",
    "contatoartisticope@gmail.com": "Bug System",
    "giuseppebandini36@gmail.com": "Bandini"
  },
  adminEmails: {
    "startbookings@gmail.com": "Ingrid (Master)",
    "cassiac.gouveia@gmail.com": "Cassia"
  },
  bookerEmails: {
    "rayannecaldas@gmail.com": "Rayanne",
    "mheloisasoaresth@gmail.com": "Heloísa"
  }
};

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
  appState.artistEmails = JSON.parse(localStorage.getItem("sb_artistEmails")) || {
    "raianlameira@hotmail.com": "Se7e",
    "contato.anotherreality@gmail.com": "Another Reality",
    "parallelusmusic@gmail.com": "Parallelus",
    "atomuz_@outlook.com": "Atomuz",
    "contatoartisticope@gmail.com": "Bug System",
    "giuseppebandini36@gmail.com": "Bandini",
    "gabrielramos0420@gmail.com": "Invader Space",
    "oliveira.lay12@gmail.com": "Shuri"
  };
  appState.adminEmails = JSON.parse(localStorage.getItem("sb_adminEmails")) || { "startbookings@gmail.com": "Ingrid (Master)", "cassiac.gouveia@gmail.com": "Cassia" };
  if (!appState.adminEmails["cassiac.gouveia@gmail.com"]) appState.adminEmails["cassiac.gouveia@gmail.com"] = "Cassia";
  
  appState.bookerEmails = JSON.parse(localStorage.getItem("sb_bookerEmails")) || { "rayannecaldas@gmail.com": "Rayanne", "mheloisasoaresth@gmail.com": "Heloísa" };
  if (!appState.bookerEmails["rayannecaldas@gmail.com"]) appState.bookerEmails["rayannecaldas@gmail.com"] = "Rayanne";
  if (!appState.bookerEmails["mheloisasoaresth@gmail.com"]) appState.bookerEmails["mheloisasoaresth@gmail.com"] = "Heloísa";
} catch (err) {
  console.error("Storage error:", err);
}

// Global variables for sorting and tabs
let currentSortColumn = "date";
let currentSortOrder = "asc"; // 'asc' or 'desc'
let currentActiveEventGroup = null;

// Chart Instances
let monthlyChart = null;
let statusDoughnutChart = null;

// Initialize App on DOM Loaded
document.addEventListener("DOMContentLoaded", async () => {
  initLogin();
  initNavigation();
  initTableSorting();
  initTableFilters();
  initEventModal();
  initSettings();
  initColorPicker();
  initClientModule();
  initLogisticsModule();


  // Try to load auth state from Supabase
  if (sbClient) {
    try {
      const { data: { session } } = await sbClient.auth.getSession();
      if (session) {
        dbg("Usuário já está logado via Supabase:", session.user.email);
        const user = session.user;
        let roleFound = "";
        const userEmail = (user.email || '').toLowerCase();
        const ADMIN_EMAILS = ["startbookings@gmail.com", "cassiac.gouveia@gmail.com"];
        const BOOKER_EMAILS = ["rayannecaldas@gmail.com", "mheloisasoaresth@gmail.com"];
        const profData = await fetchProfileData(user.id);

        if (profData && profData.role === "Logistica") {
          roleFound = `${user.user_metadata?.name || "Logística"} (Logística)`;
        } else if ((profData && profData.role === "Booker") || BOOKER_EMAILS.includes(userEmail)) {
          const bName = appState.bookerEmails && appState.bookerEmails[userEmail] ? appState.bookerEmails[userEmail] : (user.user_metadata?.name || "Booker");
          roleFound = `${bName} (Booker)`;
        } else if ((profData && profData.role === "Admin") || ADMIN_EMAILS.includes(userEmail)) {
          roleFound = `${user.user_metadata?.name || "Admin"} (Admin)`;
        } else if (user.user_metadata && user.user_metadata.role === "Admin") {
          roleFound = `${user.user_metadata.name || "Admin"} (Admin)`;
        } else {
          // Check Supabase profiles artist_name first, then local mapping, then fallback
          const mappedArtist = appState.artistEmails[userEmail];
          const prof = (profData && profData.artist_name) ? profData.artist_name : (mappedArtist || (user.user_metadata ? (user.user_metadata.artistProfile || user.user_metadata.name) : "Artista"));
          roleFound = `${prof} (Artista)`;
        }
        appState.currentRole = roleFound;
        try { sessionStorage.setItem("sb_current_role", roleFound); } catch (e) { }
        applyRoleUIChanges(roleFound);
        
        // --- Session Token Check ---
        startSessionTokenCheck(user, profData);

        document.getElementById("login-overlay").classList.add("hidden");

        // O banco é a fonte de verdade: carrega os eventos de lá.
        showAppLoading();
        await loadEventsFromSupabase();
        await loadArtistEmailsFromSupabase();
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

// Busca TODAS as linhas de uma tabela paginando em blocos. O Supabase tem um
// teto padrão de 1000 linhas por requisição; sem isto, acima de 1000 registros
// o select truncaria SILENCIOSAMENTE e os totais (dashboard/financeiro) ficariam
// errados. Ordena por uma coluna estável para não duplicar/perder linha entre
// as páginas. Mantém o mesmo formato de retorno { data, error }.
async function fetchAllRows(table, orderColumn) {
  const PAGE = 1000;
  let from = 0;
  let all = [];
  while (true) {
    let q = sbClient.from(table).select('*').range(from, from + PAGE - 1);
    if (orderColumn) q = q.order(orderColumn, { ascending: true });
    const { data, error } = await q;
    if (error) return { data: null, error };
    const batch = data || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;   // última página
    from += PAGE;
  }
  return { data: all, error: null };
}

// Carrega os eventos do Supabase para o appState (substitui o local).
// Mapeia mesmo quando o banco está vazio, para NÃO recriar dados de exemplo.
async function loadEventsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data: dbEvents, error } = await fetchAllRows('events', 'id');
    if (error) {
      console.error("Supabase fetch error:", error);
      return;
    }
    appState.events = (dbEvents || []).map(dbEv => ({
      id: dbEv.id,
      groupId: dbEv.group_id,
      event: dbEv.event_name,
      date: dbEv.event_date,
      venue: dbEv.venue || "",
      estado: dbEv.estado || "",
      artist: dbEv.artist || "",
      vendedor: dbEv.vendedor || "",
      status: dbEv.status || "antes",
      amount: dbEv.amount || 0,
      financeNotes: dbEv.finance_notes || "",
      clientId: dbEv.client_id || "cli-a-definir",
      contractStatus: dbEv.contract_status || "pendente"
    }));

    // Sincroniza artistas e vendedores do banco para o estado local, evitando que "sumam"
    let updatedConfig = false;
    appState.events.forEach(e => {
      if (e.artist && !appState.artists.includes(e.artist)) {
        appState.artists.push(e.artist);
        if (typeof getRandomColor === 'function') {
          appState.tagColors[e.artist] = getRandomColor();
        } else {
          appState.tagColors[e.artist] = '#ffcc00';
        }
        updatedConfig = true;
      }
      if (e.vendedor && !appState.sellers.includes(e.vendedor)) {
        appState.sellers.push(e.vendedor);
        if (typeof getRandomColor === 'function') {
          appState.tagColors[e.vendedor] = getRandomColor();
        } else {
          appState.tagColors[e.vendedor] = '#9a9a9f';
        }
        updatedConfig = true;
      }
    });

    try {
      localStorage.setItem("sb_events", JSON.stringify(appState.events));
      if (updatedConfig) {
        localStorage.setItem("sb_artists", JSON.stringify(appState.artists));
        localStorage.setItem("sb_sellers", JSON.stringify(appState.sellers));
        localStorage.setItem("sb_tagColors", JSON.stringify(appState.tagColors));
        if (typeof updateDropdownOptions === 'function') updateDropdownOptions();
      }
    } catch (e) { }
  } catch (err) {
    console.error("loadEventsFromSupabase error:", err);
  }
}

// Carrega os emails mapeados dos artistas do Supabase (Apenas Admin tem permissão)
async function loadArtistEmailsFromSupabase() {
  if (!sbClient) return;
  try {
    // Default fallback mappings that must exist online
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

    // Se o usuário atual for Admin e não houver erro, envia para a nuvem os e-mails padrões que estiverem faltando
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

// Carrega os clientes do Supabase para o appState (fonte de verdade = banco).
async function loadClientsFromSupabase() {
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

// Carrega as logísticas (Admin/Logística) para o appState.
async function loadLogisticsFromSupabase() {
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

async function loadEventCardsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data, error } = await fetchAllRows('event_cards', 'group_id');
    if (error) { console.error("Supabase event_cards fetch error:", error); return; }
    appState.eventCards = (data || []).map(r => ({
      groupId: r.group_id,
      coluna: r.coluna || 'todo',
      checklist: Array.isArray(r.checklist) ? r.checklist : [],
      lembrete: r.lembrete || null
    }));
    try { localStorage.setItem("sb_event_cards", JSON.stringify(appState.eventCards)); } catch (e) { }
  } catch (err) { console.error("loadEventCardsFromSupabase error:", err); }
}

function getEventCard(groupId) {
  return appState.eventCards.find(c => c.groupId === groupId) || null;
}

function saveEventCard(card) {
  const idx = appState.eventCards.findIndex(c => c.groupId === card.groupId);
  if (idx > -1) appState.eventCards[idx] = card; else appState.eventCards.push(card);
  try { localStorage.setItem("sb_event_cards", JSON.stringify(appState.eventCards)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('event_cards').upsert({
      group_id: card.groupId, coluna: card.coluna,
      checklist: card.checklist, lembrete: card.lembrete, updated_at: new Date().toISOString()
    }).then(({ error }) => { if (error) console.error("event_cards sync error:", error); setSyncStatus(error ? 'offline' : 'saved'); });
  }
}

function deleteEventCard(groupId) {
  appState.eventCards = appState.eventCards.filter(c => c.groupId !== groupId);
  try { localStorage.setItem("sb_event_cards", JSON.stringify(appState.eventCards)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('event_cards').delete().eq('group_id', groupId)
      .then(({ error }) => { if (error) console.error("event_cards delete error:", error); });
  }
}

// Chave de grupo de um evento (mesma lógica usada na tabela de eventos).
function eventGroupKey(e) {
  return e.groupId || `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
}

// Garante 1 card por evento (auto-criação + backfill). Idempotente.
function ensureCardsForEvents() {
  const seen = new Set();
  (appState.events || []).forEach(e => {
    const gid = eventGroupKey(e);
    if (seen.has(gid)) return;
    seen.add(gid);
    if (!getEventCard(gid)) {
      saveEventCard({
        groupId: gid, coluna: 'todo',
        checklist: DEFAULT_CHECKLIST.map(i => ({ ...i })),
        lembrete: null
      });
    }
  });
}

// Carrega os eventos (sem financeiro) via função segura, para o dashboard/cascata.
async function loadLogisticsEvents() {
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

// Lê o papel e o nome do artista do usuário logado na tabela profiles (fonte de verdade).
async function fetchProfileData(userId) {
  if (!sbClient || !userId) return null;
  try {
    const { data, error } = await sbClient.from('profiles').select('role, artist_name, session_token').eq('id', userId).single();
    if (error) return null;
    return data ? data : null;
  } catch (e) { return null; }
}

const LOGI_STATUS_LABELS = { pendente: "Logística Pendente", andamento: "Logística em Andamento", concluida: "Concluída" };

function getLogisticsRecord(eventKey, artist) {
  return appState.logistics.find(r => r.eventKey === eventKey && r.artist === artist) || null;
}

// Rótulo do valor conforme o modo de transporte do trecho.
const COST_LABELS = {
  carro_proprio: "Gasolina",
  carro: "Passagem (BlaBlaCar)",
  uber: "Uber",
  taxi: "Táxi",
  aviao: "Passagem (avião)",
  onibus: "Passagem (ônibus)"
};

// Custo total da logística de UM registro = ida + volta + hospedagem.
// Aceita o registro de logística (ou null). Valores vazios/ausentes contam 0.
function getLogisticsCost(record) {
  if (!record || !record.data) return 0;
  const d = record.data;
  const v = (x) => parseFloat(x && x.valor) || 0;
  const hotel = d.hotel && d.temHospedagem !== false ? (parseFloat(d.hotel.valor) || 0) : 0;
  return v(d.ida) + v(d.volta) + hotel;
}

// Checklist padrão de um evento novo (7 etapas).
const DEFAULT_CHECKLIST = [
  { texto: "Iniciar negociação", feito: false },
  { texto: "Escolher artistas", feito: false },
  { texto: "Fechar valores (cachê)", feito: false },
  { texto: "Enviar contrato", feito: false },
  { texto: "Receber sinal", feito: false },
  { texto: "Fazer logísticas dos artistas", feito: false },
  { texto: "Acerto final / pagamento", feito: false }
];

// Progresso de uma checklist.
function checklistProgress(list) {
  const arr = Array.isArray(list) ? list : [];
  return { feitos: arr.filter(i => i && i.feito).length, total: arr.length };
}

// Estado do lembrete de um card: "atrasado" | "chegando" | "nenhum".
function reminderState(card, hojeStr, antecedenciaDias = 3) {
  const l = card && card.lembrete;
  if (!l || !l.ativo || !l.data) return "nenhum";
  if (l.data < hojeStr) return "atrasado";
  const limite = new Date(hojeStr + "T00:00:00");
  limite.setDate(limite.getDate() + antecedenciaDias);
  const limiteStr = limite.toISOString().slice(0, 10);
  if (l.data <= limiteStr) return "chegando";
  return "nenhum";
}

// Lista os lembretes ligados em estado de alerta, com nome/estado do evento.
function collectDueReminders(eventCards, events, hojeStr) {
  const out = [];
  (eventCards || []).forEach(card => {
    const st = reminderState(card, hojeStr);
    if (st === "nenhum") return;
    const ev = (events || []).find(e => (e.groupId || "") === card.groupId);
    out.push({
      groupId: card.groupId,
      eventName: ev ? ev.event : card.groupId,
      estado: ev ? (ev.estado || "") : "",
      estado_alerta: st
    });
  });
  return out;
}

function getArtistLogisticsStatus(eventKey, artist) {
  return deriveLogisticsStatus(getLogisticsRecord(eventKey, artist));
}

// Cria/atualiza uma logística no estado e no Supabase.
function saveLogistics(record) {
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
function getOrCreateLogistics(groupId, artist, eventDate) {
  let rec = getLogisticsRecord(groupId || "", artist);
  if (rec) {
    rec.data = rec.data || {};
    return rec;
  }
  rec = {
    id: "log-" + Date.now() + Math.floor(Math.random() * 1000),
    eventKey: groupId || "",
    eventDate: eventDate || null,
    artist: artist,
    groupId: groupId || "",
    status: "andamento",
    data: { temHospedagem: false, hotel: null, ida: {}, volta: {} }
  };
  return rec;
}

// Desmembra: dá um group_id novo só àquele registro (passa a ser editado isolado).
function splitLogistics(id) {
  const rec = appState.logistics.find(r => r.id === id);
  if (!rec) return;
  rec.groupId = "lgrp-" + Date.now() + Math.floor(Math.random() * 1000);
  saveLogistics(rec);
  renderLogisticsDashboard();
  showToast("Artista desmembrado do grupo.");
}

// Retorna o nome do cliente a partir do id (ou "—").
function getClientName(clientId) {
  const c = appState.clients.find(cl => cl.id === clientId);
  return c ? c.name : "—";
}

// Cria/atualiza um cliente no estado e sincroniza com o Supabase.
function saveClient(client) {
  const idx = appState.clients.findIndex(c => c.id === client.id);
  if (idx > -1) appState.clients[idx] = client;
  else appState.clients.push(client);
  try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('clients').upsert({ id: client.id, name: client.name, contact: client.contact || "" })
      .then(({ error }) => { if (error) console.error("Supabase client sync error:", error); setSyncStatus(error ? 'offline' : 'saved'); });
  }
}

// Remove um cliente — bloqueia se houver eventos vinculados ou se for o padrão.
function deleteClient(clientId) {
  if (clientId === 'cli-a-definir') {
    showWarningToast("O cliente 'A definir' não pode ser excluído.");
    return;
  }
  const linked = appState.events.filter(e => e.clientId === clientId).length;
  if (linked > 0) {
    showWarningToast(`Este cliente tem ${linked} evento(s) vinculado(s). Reatribua-os antes de excluir.`);
    return;
  }
  showConfirmModal("Excluir Cliente", "Tem certeza que deseja excluir este cliente?", () => {
    appState.clients = appState.clients.filter(c => c.id !== clientId);
    try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) { }
    if (sbClient && appState.currentRole) {
      sbClient.from('clients').delete().eq('id', clientId)
        .then(({ error }) => { if (error) console.error("Supabase client delete error:", error); });
    }
    renderClientsView();
    showToast("Cliente excluído.");
  });
}

// LGPD/privacidade: remove do navegador (localStorage) os dados pessoais e
// operacionais em cache. Chamado no logout para que nada de PII (clientes,
// contatos, logística, e-mails) fique legível numa máquina compartilhada.
// Os dados continuam no Supabase, protegidos por RLS.
function clearLocalPII() {
  const keys = [
    "sb_events", "sb_clients", "sb_logistics", "sb_event_cards",
    "sb_logisticsEvents", "sb_artistEmails", "sb_adminEmails", "sb_users",
    "sb_artists", "sb_sellers", "sb_tagColors", "sb_goals", "sb_session_token"
  ];
  keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
}

// Save State Helper
function saveState() {
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
    // Sync to Supabase in background
    if (appState.events && appState.events.length > 0) {
      const mappedEvents = appState.events.map(ev => ({
        id: ev.id,
        group_id: ev.groupId || ev.id,
        event_name: ev.event,
        event_date: ev.date,
        venue: ev.venue || null,
        estado: ev.estado || "",
        artist: ev.artist || "",
        vendedor: ev.vendedor || "",
        status: ev.status || 'antes',
        amount: ev.amount || 0,
        finance_notes: ev.financeNotes || "",
        client_id: ev.clientId || "cli-a-definir",
        contract_status: ev.contractStatus || "pendente"
      }));
      if (sbClient) {
        sbClient.from('events').upsert(mappedEvents).then(({ error }) => {
          if (error) console.error("Supabase Sync Error:", error);
          setSyncStatus(error ? 'offline' : 'saved');
        });
      } else {
        console.warn("Supabase script not loaded. Saving locally only.");
      }
    }
  } else {
    sessionStorage.removeItem("sb_current_role");
  }
}

function initLogin() {
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

    // Admin emails list
    const ADMIN_EMAILS = ["startbookings@gmail.com", "cassiac.gouveia@gmail.com"];
    const BOOKER_EMAILS = ["rayannecaldas@gmail.com", "mheloisasoaresth@gmail.com"];

    // Auto-assign role: Admin for admin email, Booker for booker email, Artista if email is in artistEmails, otherwise Artista genérico
    let role = "Artista";
    let artistProfile = "";
    if (ADMIN_EMAILS.includes(email)) {
      role = "Admin";
    } else if (BOOKER_EMAILS.includes(email)) {
      role = "Booker";
    } else if (appState.artistEmails[email]) {
      role = "Artista";
      artistProfile = appState.artistEmails[email];
    }

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
          data: { name: artistProfile || name, role: role, artistProfile: artistProfile },
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

  // --- 2. LOGIN LOGIC ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-username").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;

    let loginEmail = email;
    if (!loginEmail.includes("@")) {
      const foundArtist = Object.keys(appState.artistEmails || {}).find(e => (appState.artistEmails[e] || "").toLowerCase() === loginEmail);
      if (foundArtist) {
        loginEmail = foundArtist;
      } else {
        const foundAdmin = Object.keys(appState.adminEmails || {}).find(e => (appState.adminEmails[e] || "").toLowerCase() === loginEmail);
        if (foundAdmin) loginEmail = foundAdmin;
      }
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
        console.error("Login:", error); showToast(friendlyAuthError(error.message), "error");
      } else if (data.session) {
        const user = data.session.user;
        const userEmail = (user.email || '').toLowerCase();
        const ADMIN_EMAILS = ["startbookings@gmail.com", "cassiac.gouveia@gmail.com"];
        const BOOKER_EMAILS = ["rayannecaldas@gmail.com", "mheloisasoaresth@gmail.com"];
        let roleFound = "Artista";
        const profData = await fetchProfileData(user.id);

        if (profData && profData.role === "Logistica") {
          roleFound = `${user.user_metadata?.name || "Logística"} (Logística)`;
        } else if ((profData && profData.role === "Booker") || BOOKER_EMAILS.includes(userEmail)) {
          const bName = appState.bookerEmails && appState.bookerEmails[userEmail] ? appState.bookerEmails[userEmail] : (user.user_metadata?.name || "Booker");
          roleFound = `${bName} (Booker)`;
        } else if ((profData && profData.role === "Admin") || ADMIN_EMAILS.includes(userEmail)) {
          roleFound = `${user.user_metadata?.name || "Admin"} (Admin)`;
        } else if (user.user_metadata && user.user_metadata.role === "Admin") {
          roleFound = `${user.user_metadata.name || "Admin"} (Admin)`;
        } else {
          // Check Supabase profiles artist_name first, then local mapping, then fallback
          const mappedArtist = appState.artistEmails[userEmail];
          const prof = (profData && profData.artist_name) ? profData.artist_name : (mappedArtist || (user.user_metadata ? (user.user_metadata.artistProfile || user.user_metadata.name) : "Artista"));
          roleFound = `${prof} (Artista)`;
        }

        appState.currentRole = roleFound;
        try { sessionStorage.setItem("sb_current_role", roleFound); } catch (e) { }
        applyRoleUIChanges(roleFound);
        
        // --- Session Token Check ---
        startSessionTokenCheck(user, profData);

        // --- Auditoria: registra o login (best-effort, não bloqueia) ---
        logLogin(user);

        loginOverlay.classList.add("hidden");

        // Carrega os eventos REAIS do banco (não re-envia dados de exemplo).
        showAppLoading();
        await loadEventsFromSupabase();
        await loadArtistEmailsFromSupabase();
        await loadClientsFromSupabase();
        await loadLogisticsFromSupabase();
        await loadEventCardsFromSupabase();
        await loadLogisticsEvents();

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

let sessionCheckInterval = null;
async function startSessionTokenCheck(user, profData) {
  if (!sbClient) return;
  
  let myToken = localStorage.getItem("sb_session_token");
  let dbToken = profData ? profData.session_token : null;
  
  if (!myToken) {
    myToken = crypto.randomUUID();
    localStorage.setItem("sb_session_token", myToken);
    await sbClient.from("profiles").update({ session_token: myToken }).eq("id", user.id);
  } else if (!dbToken || dbToken !== myToken) {
    // If there is a dbToken and it differs from myToken upon login, overwrite it because I'm the new valid session.
    await sbClient.from("profiles").update({ session_token: myToken }).eq("id", user.id);
  }
  
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);
  
  sessionCheckInterval = setInterval(async () => {
    try {
      const pData = await fetchProfileData(user.id);
      if (pData && pData.session_token && pData.session_token !== myToken) {
        clearInterval(sessionCheckInterval);
        await sbClient.auth.signOut();
        try { showWarningToast("Sua conta foi conectada em outro dispositivo.\nVocê foi desconectado deste."); } catch (e) {}
        setTimeout(() => window.location.reload(), 2500);
      }
    } catch (e) { console.error("Session check error", e); }
  }, 30000); // Verify every 30s
}

// Registra o login na tabela login_logs (auditoria). Best-effort: qualquer
// falha é silenciosa e NÃO atrapalha o acesso do usuário. A RLS garante que
// cada um só insere a própria linha e só admin lê.
async function logLogin(user) {
  if (!sbClient || !user) return;
  try {
    await sbClient.from("login_logs").insert({
      user_id: user.id,
      email: (user.email || "").toLowerCase(),
      user_agent: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(0, 300)
    });
  } catch (e) { dbg("logLogin falhou (ignorado):", e); }
}

function applyRoleUIChanges(role) {
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
function getFilteredEvents() {
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
function initNavigation() {
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
      if (typeof updateDropdownOptions === "function") updateDropdownOptions();
      renderEventTable();
    } else if (targetView === "timeline") {
      if (typeof updateDropdownOptions === "function") updateDropdownOptions();
      renderTimeline();
    } else if (targetView === "settings") {
      if (typeof updateConfigLists === "function") updateConfigLists();
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

// 3. DASHBOARD LOGIC (Calculations & Charts)
function updateDashboard() {
  const events = getFilteredEvents();
  const totalRevenue = events.reduce((sum, e) => sum + e.amount, 0);
  const totalShows = events.length;
  const activeNegotiations = events.filter(e => e.status === "durante").length;

  // Format faturamento
  const formattedRevenue = formatCurrency(totalRevenue);

  // Update header and card total faturamento
  if (document.getElementById("header-total-revenue")) document.getElementById("header-total-revenue").textContent = formattedRevenue;
  if (document.getElementById("kpi-total-revenue")) document.getElementById("kpi-total-revenue").textContent = formattedRevenue;
  if (document.getElementById("kpi-total-shows")) document.getElementById("kpi-total-shows").textContent = totalShows;
  if (document.getElementById("kpi-active-negotiations")) document.getElementById("kpi-active-negotiations").textContent = activeNegotiations;

  // Goal Tracking
  const currentName = appState.currentRole ? appState.currentRole.split(" (")[0] : "Admin";
  let goalValue = appState.goals[currentName] || 500000; // Default to 500k if not set

  document.getElementById("kpi-goal-value").textContent = formatCurrency(goalValue);

  const percent = goalValue > 0 ? Math.min(100, Math.round((totalRevenue / goalValue) * 100)) : 0;
  document.getElementById("kpi-goal-percent").textContent = `${percent}%`;
  document.getElementById("dashboard-progress-fill").style.width = `${percent}%`;

  // Render/Update charts
  renderDashboardCharts(events);
}

function renderDashboardCharts(events) {
  // Chart Colors (Yellow theme)
  const yellowColor = '#ffcc00';
  const yellowHover = '#ffd633';
  const grayColor = '#1c1c22';
  const gridColor = 'rgba(255, 255, 255, 0.05)';
  const textColor = '#9a9a9f';

  // 1. Monthly Revenue Chart (Bar Chart)
  // Initialize monthly revenue object for 2026
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthlyRevenue = Array(12).fill(0);

  events.forEach(e => {
    const d = new Date(e.date);
    if (!isNaN(d.getTime())) {
      const mIndex = d.getMonth();
      monthlyRevenue[mIndex] += e.amount;
    }
  });

  const ctxMonthly = document.getElementById("monthlyRevenueChart").getContext("2d");
  if (monthlyChart) {
    monthlyChart.destroy();
  }

  monthlyChart = new Chart(ctxMonthly, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Faturamento',
        data: monthlyRevenue,
        backgroundColor: 'rgba(255, 204, 0, 0.85)',
        borderColor: yellowColor,
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: yellowHover
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              return ' ' + formatCurrency(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Inter' },
            callback: function (value) {
              if (value >= 1000) {
                return 'R$ ' + (value / 1000) + 'k';
              }
              return 'R$ ' + value;
            }
          }
        },
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'Inter' } }
        }
      }
    }
  });

  // 2. Status Doughnut Chart
  const statusCounts = { antes: 0, durante: 0, apos: 0 };
  events.forEach(e => {
    if (statusCounts[e.status] !== undefined) {
      statusCounts[e.status]++;
    }
  });

  const ctxStatus = document.getElementById("statusChart").getContext("2d");
  if (statusDoughnutChart) {
    statusDoughnutChart.destroy();
  }

  statusDoughnutChart = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: ['Antes (Negociação)', 'Durante (Confirmado)', 'Após (Concluído)'],
      datasets: [{
        data: [statusCounts.antes, statusCounts.durante, statusCounts.apos],
        backgroundColor: [
          'rgba(255, 69, 58, 0.8)',
          'rgba(255, 204, 0, 0.8)',
          'rgba(48, 209, 88, 0.8)'
        ],
        borderColor: '#121216',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 11 },
            padding: 15
          }
        }
      },
      cutout: '65%'
    }
  });
}

// 4. CLICKUP-STYLE TABLE LOGIC (Sorting, Filtering, Crud)
function initTableFilters() {
  const searchInput = document.getElementById("table-search");
  const artistSelect = document.getElementById("filter-artist");
  const sellerSelect = document.getElementById("filter-seller");
  const statusSelect = document.getElementById("filter-status");
  // Search filter
  searchInput.addEventListener("input", renderEventTable);

  // Status filter
  statusSelect.addEventListener("change", renderEventTable);

  // Artist filter
  artistSelect.addEventListener("change", (e) => {
    if (e.target.value === "create_new") {
      showPromptModal("Novo Artista", "Digite o nome do novo Artista:", "", (name) => {
        if (name && name.trim()) {
          const newName = name.trim();
          if (!appState.artists.includes(newName)) {
            appState.artists.push(newName);
            appState.tagColors[newName] = getRandomColor();
            saveState();
            updateDropdownOptions();
            if (typeof updateConfigLists === "function") updateConfigLists();
            artistSelect.value = newName;
            showToast(`Artista ${newName} criado!`);
          } else {
            showToast("Artista já cadastrado.", "error");
            artistSelect.value = "all";
          }
        } else {
          artistSelect.value = "all";
        }
        renderEventTable();
      });
    } else {
      renderEventTable();
    }
  });

  if (sellerSelect) {
    sellerSelect.addEventListener("change", (e) => {
      if (e.target.value === "create_new") {
        showPromptModal("Novo Vendedor", "Digite o nome do novo Vendedor:", "", (name) => {
          if (name && name.trim()) {
            const newName = name.trim();
            if (!appState.sellers.includes(newName)) {
              appState.sellers.push(newName);
              appState.tagColors[newName] = getRandomColor();
              saveState();
              updateDropdownOptions();
              if (typeof updateConfigLists === "function") updateConfigLists();
              sellerSelect.value = newName;
              showToast(`Vendedor ${newName} criado!`);
            } else {
              showToast("Vendedor já cadastrado.", "error");
              sellerSelect.value = "all";
            }
          } else {
            sellerSelect.value = "all";
          }
          renderEventTable();
        });
      } else {
        renderEventTable();
      }
    });
  }

  // Initialize artist dropdowns in filters and modals
  updateDropdownOptions();
}

function updateDropdownOptions() {
  const filterArtist = document.getElementById("filter-artist");
  const timelineArtist = document.getElementById("timeline-artist-select");

  // Clear and populate filters
  const artistFilterSelect = document.getElementById("filter-artist");
  if (artistFilterSelect) {
    const prevVal = artistFilterSelect.value;
    artistFilterSelect.innerHTML = `<option value="all">Todos os Artistas</option>` +
      appState.artists.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('') +
      `<option value="create_new" style="font-weight:bold; color:var(--yellow-primary);">+ Criar Novo Artista...</option>`;
    if (Array.from(artistFilterSelect.options).some(o => o.value === prevVal)) artistFilterSelect.value = prevVal;
  }

  const sellerFilterSelect = document.getElementById("filter-seller");
  if (sellerFilterSelect) {
    const prevVal = sellerFilterSelect.value;
    sellerFilterSelect.innerHTML = `<option value="all">Toda a Equipe</option>` +
      appState.sellers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('') +
      `<option value="create_new" style="font-weight:bold; color:var(--yellow-primary);">+ Criar Novo Vendedor...</option>`;
    if (Array.from(sellerFilterSelect.options).some(o => o.value === prevVal)) sellerFilterSelect.value = prevVal;
  }

  if (timelineArtist) {
    timelineArtist.innerHTML = '<option value="all">Todos os Artistas</option>';
    appState.artists.forEach(artist => {
      const optTimeline = document.createElement("option");
      optTimeline.value = artist;
      optTimeline.textContent = artist;
      timelineArtist.appendChild(optTimeline);
    });
  }

  // Atualiza selects dinâmicos do modal
  document.querySelectorAll(".event-artist-input").forEach(select => {
    const prevVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Selecione o artista</option>' +
      appState.artists.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
    if (prevVal && appState.artists.includes(prevVal)) select.value = prevVal;
  });

  document.querySelectorAll(".event-seller-input").forEach(select => {
    const prevVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Selecione quem vendeu</option>' +
      appState.sellers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    if (prevVal && appState.sellers.includes(prevVal)) select.value = prevVal;
  });
}

function initTableSorting() {
  // The table headers are re-created on every renderEventTable(), so we use
  // event delegation on the persistent container instead of binding to the
  // (not-yet-existing) headers once at startup.
  const container = document.getElementById("events-list-container");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const header = e.target.closest("th.sortable");
    if (!header || !container.contains(header)) return;

    const column = header.getAttribute("data-sort");
    if (!column) return;

    if (currentSortColumn === column) {
      currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
    } else {
      currentSortColumn = column;
      currentSortOrder = "asc";
    }

    renderEventTable();
  });
}

function updateGroupField(items, field, value) {
  items.forEach(item => {
    const obj = appState.events.find(ev => ev.id === item.id);
    if (obj) obj[field] = value;
  });
  saveState();

  if (items.length > 0) {
    const first = items[0];
    currentActiveEventGroup = `${first.event}|${first.date}|${first.venue}|${first.estado || ''}`;
  }

  renderEventTable();
  updateDashboard();
  renderTimeline();
}

const CONTRACT_LABELS = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };
const PAYMENT_LABELS = { pendente: "Pendente", sinal_pago: "Sinal Pago", pago_total: "Totalmente Pago" };

function renderClientsView() {
  const container = document.getElementById("clients-list-container");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.clients || appState.clients.length === 0) {
    container.innerHTML = emptyStateHtml("Nenhum cliente ainda — cadastre um cliente ao criar um evento.");
    return;
  }

  const term = (document.getElementById("client-search")?.value || "").toLowerCase().trim();
  const clients = appState.clients
    .filter(c => c.name.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (clients.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:30px; border:1px solid var(--border-color); border-radius:8px;">Nenhum cliente cadastrado.</div>`;
    return;
  }

  window.collapsedClients = window.collapsedClients || new Set();

  clients.forEach(client => {
    const safeName = escapeHtml(client.name);
    const safeContact = escapeHtml(client.contact || "");
    const safeId = escapeHtml(client.id);

    const clientEvents = appState.events.filter(e => e.clientId === client.id);
    const groups = {};
    clientEvents.forEach(e => {
      const key = `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
      if (!groups[key]) groups[key] = { event: e.event, date: e.date, items: [], contract: e.contractStatus || 'pendente' };
      groups[key].items.push(e);
    });
    const groupKeys = Object.keys(groups).sort((a, b) => new Date(groups[a].date) - new Date(groups[b].date));
    const eventCount = groupKeys.length;
    const isCollapsed = window.collapsedClients.has(client.id);

    let historyHtml = "";
    if (groupKeys.length === 0) {
      historyHtml = `<div style="padding:14px 20px; color:var(--text-muted); font-size:13px;">Nenhuma produção registrada para este cliente.</div>`;
    } else {
      historyHtml = groupKeys.map(k => {
        const g = groups[k];
        const lineup = g.items.map(i => escapeHtml(i.artist || "—")).filter(Boolean).join(", ");
        const lineupLabel = g.items.length > 1 ? "Artistas:" : "Artista:";
        const paidCount = g.items.filter(i => getPaymentStatus(i.amount, i.amountReceived) === 'pago_total').length;
        const contract = g.contract;
        return `
          <div class="client-history-item">
            <div class="client-history-main">
              <strong>${escapeHtml(g.event || "—")}</strong>
              <span class="client-history-date">${formatDate(g.date)}</span>
            </div>
            <div class="client-history-lineup"><span>${lineupLabel}</span> ${lineup || "—"}</div>
            <div class="client-history-badges">
              <span class="badge badge-contract badge-contract-${contract}">Contrato: ${CONTRACT_LABELS[contract] || contract}</span>
              <span class="badge badge-payment">Pagamento: ${paidCount}/${g.items.length} pagos</span>
            </div>
          </div>`;
      }).join("");
    }

    const card = document.createElement("div");
    card.className = "event-group";
    card.innerHTML = `
      <div class="event-group-header${isCollapsed ? ' collapsed-header' : ''}" data-client="${safeId}">
        <div class="accordion-toggle${isCollapsed ? ' is-collapsed' : ''}">
          <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="event-group-title">
          <div class="event-group-field"><span class="event-group-field-label">Cliente</span><strong>${safeName}</strong></div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field"><span class="event-group-field-label">Contato</span><span>${safeContact || "—"}</span></div>
        </div>
        <div style="display:flex; align-items:center; gap:15px; margin-right:15px;">
          <span class="event-group-artist-count">${eventCount} evento${eventCount !== 1 ? 's' : ''}</span>
          <div style="display:flex; gap:10px;">
            <button class="action-icon-btn edit-client-btn" data-id="${safeId}" title="Editar Cliente" aria-label="Editar cliente ${safeName}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            ${(!appState.currentRole || !appState.currentRole.includes("(Admin)")) ? '' : `<button class="action-icon-btn delete-client-btn" data-id="${safeId}" title="Excluir Cliente" aria-label="Excluir cliente ${safeName}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>`}
          </div>
        </div>
      </div>
      <div class="event-table-container${isCollapsed ? ' collapsed' : ''}" data-client="${safeId}">
        ${historyHtml}
      </div>`;
    container.appendChild(card);
  });

  container.querySelectorAll(".event-group-header").forEach(header => {
    header.addEventListener("click", (e) => {
      if (e.target.closest(".action-icon-btn")) return;
      const id = header.getAttribute("data-client");
      if (window.collapsedClients.has(id)) window.collapsedClients.delete(id);
      else window.collapsedClients.add(id);
      renderClientsView();
    });
  });
  container.querySelectorAll(".edit-client-btn").forEach(btn => {
    btn.addEventListener("click", () => openClientModal(btn.getAttribute("data-id")));
  });
  container.querySelectorAll(".delete-client-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteClient(btn.getAttribute("data-id")));
  });
}

function openClientModal(clientId) {
  const modal = document.getElementById("client-modal");
  if (!modal) return;
  const title = document.getElementById("client-modal-title");
  const idInput = document.getElementById("client-id-input");
  const nameInput = document.getElementById("client-name-input");
  const contactInput = document.getElementById("client-contact-input");

  if (clientId) {
    const c = appState.clients.find(cl => cl.id === clientId);
    title.textContent = "Editar Cliente";
    idInput.value = c ? c.id : "";
    nameInput.value = c ? c.name : "";
    contactInput.value = c ? (c.contact || "") : "";
  } else {
    title.textContent = "Novo Cliente";
    idInput.value = "";
    nameInput.value = "";
    contactInput.value = "";
  }
  modal.classList.add("show");
  nameInput.focus();
}

function initClientModule() {
  const modal = document.getElementById("client-modal");
  const openBtn = document.getElementById("open-new-client-btn");
  const closeBtn = document.getElementById("close-client-modal-btn");
  const cancelBtn = document.getElementById("cancel-client-modal-btn");
  const saveBtn = document.getElementById("save-client-btn");
  const search = document.getElementById("client-search");
  if (!modal) return;

  const close = () => modal.classList.remove("show");
  if (openBtn) openBtn.addEventListener("click", () => openClientModal(null));
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  if (search) search.addEventListener("input", renderClientsView);

  if (saveBtn) saveBtn.addEventListener("click", () => {
    const id = document.getElementById("client-id-input").value;
    const name = document.getElementById("client-name-input").value.trim();
    const contact = document.getElementById("client-contact-input").value.trim();
    if (!name) { showWarningToast("Informe o nome do cliente."); return; }
    const clientId = id || ("cli-" + Date.now() + Math.floor(Math.random() * 1000));
    saveClient({ id: clientId, name, contact });
    close();
    renderClientsView();
    if (typeof updateClientDropdown === "function") updateClientDropdown();
    showToast(id ? "Cliente atualizado." : "Cliente cadastrado.");
  });
}

function renderEventTable() {
  const container = document.getElementById("events-list-container");
  if (!container) return;

  container.innerHTML = "";

  // Apply Search
  const term = (document.getElementById("table-search")?.value || "").toLowerCase().trim();
  const artist = document.getElementById("filter-artist")?.value || "all";
  const seller = document.getElementById("filter-seller")?.value || "all";
  const status = document.getElementById("filter-status")?.value || "all";

  let events = getFilteredEvents();

  events = events.filter(e => {
    const matchTerm = (e.event || "").toLowerCase().includes(term) || (e.venue || "").toLowerCase().includes(term);
    const matchArtist = artist === "all" || e.artist === artist;
    const matchSeller = seller === "all" || e.vendedor === seller;
    const matchStatus = status === "all" || e.status === status;
    return matchTerm && matchArtist && matchSeller && matchStatus;
  });

  // Sort Events
  events.sort((a, b) => {
    let valA = a[currentSortColumn];
    let valB = b[currentSortColumn];

    if (currentSortColumn === "amount") {
      valA = parseFloat(valA);
      valB = parseFloat(valB);
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return currentSortOrder === "asc" ? -1 : 1;
    if (valA > valB) return currentSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const isArtist = appState.currentRole ? appState.currentRole.includes("(Artista)") : false;

  if (events.length === 0) {
    const filtering = term || artist !== "all" || seller !== "all" || status !== "all";
    container.innerHTML = emptyStateHtml(filtering
      ? "Nenhum resultado para os filtros aplicados."
      : "Nenhum evento ainda — clique em + Novo Evento para começar.");
    return;
  }

  const statusLabels = { antes: "Em negociação", durante: "Confirmado", apos: "Concluído" };

  // GROUP EVENTS
  const groups = {};
  events.forEach(e => {
    const key = `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
    if (!groups[key]) {
      groups[key] = {
        event: e.event,
        date: e.date,
        venue: e.venue,
        estado: e.estado || '',
        items: [],
        key: key
      };
    }
    groups[key].items.push(e);
  });

  let groupKeys = Object.keys(groups);

  // Sort groups chronologically by date
  groupKeys.sort((a, b) => {
    const dateA = new Date(groups[a].date);
    const dateB = new Date(groups[b].date);
    return dateA - dateB;
  });

  window.collapsedGroups = window.collapsedGroups || new Set();

  // Helper to render the sortable arrow indicator inside a header
  const sortArrow = (col) => currentSortColumn === col
    ? (currentSortOrder === "asc" ? " &#9652;" : " &#9662;")
    : "";

  groupKeys.forEach(key => {
    const g = groups[key];
    const isCollapsed = window.collapsedGroups.has(key);
    const containerClass = isCollapsed ? "event-table-container collapsed" : "event-table-container";

    const formattedDate = formatDate(g.date);

    // Escaped versions for safe HTML insertion (anti-XSS)
    const safeKey = escapeHtml(key);
    const safeEvent = escapeHtml(g.event || "");
    const safeVenue = escapeHtml(g.venue || "");
    const safeEstado = escapeHtml(g.estado || "");
    const groupClientId = g.items[0] ? (g.items[0].clientId || "cli-a-definir") : "cli-a-definir";
    const groupContract = g.items[0] ? (g.items[0].contractStatus || "pendente") : "pendente";
    const safeClientName = escapeHtml(getClientName(groupClientId));

    const groupDiv = document.createElement("div");
    groupDiv.className = "event-group";

    const artistCount = g.items.length;
    const collapsedHeaderClass = isCollapsed ? " collapsed-header" : "";
    const toggleClass = isCollapsed ? "accordion-toggle is-collapsed" : "accordion-toggle";

    // Create the HTML structure for the group
    groupDiv.innerHTML = `
      <div class="event-group-header${collapsedHeaderClass}" data-key="${safeKey}">
        <div class="${toggleClass}">
          <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
        <div class="event-group-title">
          <div class="event-group-field">
            <span class="event-group-field-label">Evento</span>
            <input type="text" class="hidden-inline-input group-title-input" data-key="${safeKey}" data-field="event" value="${safeEvent}" size="${Math.max((g.event || '').length, 5)}">
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Data</span>
            <input type="text" class="hidden-inline-input group-date-input" data-key="${safeKey}" data-field="date" value="${formattedDate}" style="width: 160px;">
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Local</span>
            <input type="text" class="hidden-inline-input group-venue-input" data-key="${safeKey}" data-field="venue" value="${safeVenue}" size="${Math.max((g.venue || '').length, 5)}">
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Estado</span>
            <button class="custom-dropdown-btn group-estado-btn" data-id="${escapeHtml(g.items[0] ? String(g.items[0].id) : '')}" data-field="estado" title="Alterar estado" style="background: transparent; border: none; padding: 0; min-width: auto; height: auto; text-transform: uppercase; color: var(--yellow-primary); font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 4px; box-shadow: none; text-shadow: none;">${safeEstado || '--'}
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.6;"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Cliente</span>
            <span class="group-client-label">${safeClientName}</span>
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Contrato</span>
            ${isArtist
        ? `<span class="badge badge-contract badge-contract-${groupContract}">${CONTRACT_LABELS[groupContract] || groupContract}</span>`
        : `<button class="custom-dropdown-btn badge badge-contract badge-contract-${groupContract}" data-id="${escapeHtml(g.items[0] ? String(g.items[0].id) : '')}" data-field="contract" title="Alterar status do contrato">${CONTRACT_LABELS[groupContract] || groupContract}</button>`}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 15px; margin-right: 15px;">
          <span class="event-group-artist-count">${artistCount} artista${artistCount !== 1 ? 's' : ''}</span>
          ${isArtist || appState.currentRole?.includes("(Booker)") ? '' : `<button class="action-icon-btn delete-group-btn" data-key="${safeKey}" title="Excluir Evento Inteiro" aria-label="Excluir evento inteiro">
            <svg viewBox="0 0 24 24">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path>
            </svg>
          </button>`}
        </div>
      </div>
      <div class="${containerClass}" data-key="${safeKey}">
        <div class="table-responsive" style="border:none; border-radius:0;">
          <table class="clickup-table">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;"></th>
                <th style="width: 145px;" class="sortable" data-sort="artist">ARTISTA${sortArrow("artist")}</th>
                <th style="width: 145px;" class="sortable" data-sort="vendedor">VENDIDO POR${sortArrow("vendedor")}</th>
                <th style="width: 180px;" class="sortable" data-sort="status">STATUS${sortArrow("status")}</th>
                <th class="sortable text-left" data-sort="amount">CACHÊ${sortArrow("amount")}</th>
                <th class="text-left">LOG. (R$)</th>
                <th class="text-left">TOTAL</th>
                <th class="text-left">RECEBIDO</th>
                <th class="text-left">A RECEBER</th>
                <th>OBS.</th>
                ${isArtist ? '' : '<th style="width: 150px;">LOGÍSTICA</th>'}
                ${isArtist ? '' : '<th class="actions-header-column" style="width: 80px; text-align: center;">AÇÕES</th>'}
              </tr>
            </thead>
            <tbody class="group-tbody">
            </tbody>
          </table>
        </div>
      </div>
    `;

    const tbody = groupDiv.querySelector(".group-tbody");

    g.items.forEach(e => {
      const row = document.createElement("tr");

      const isChecked = e.status === "apos";
      const checkClass = isChecked ? "checked" : "";
      const checkIcon = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

      const amountReceived = parseFloat(e.amountReceived) || 0;
      const logiCost = getLogisticsCost(getLogisticsRecord(e.groupId || "", e.artist));
      const cachet = parseFloat(e.amount) || 0;
      const totalValue = cachet + logiCost;
      const amountToReceive = totalValue - amountReceived;
      const financeNotes = e.financeNotes || "";

      // Escaped versions for safe HTML insertion (anti-XSS)
      const safeArtist = escapeHtml(e.artist || "");
      const safeSeller = escapeHtml(e.vendedor || "");
      const safeNotes = escapeHtml(financeNotes);
      const safeId = escapeHtml(String(e.id));

      if (isArtist) {
        row.innerHTML = `
          <td style="text-align: center;">
            <div class="event-checkbox ${checkClass}" style="cursor: default;">
              ${checkIcon}
            </div>
          </td>
          <td>${safeArtist}</td>
          <td>${safeSeller}</td>
          <td><span class="status-tag status-${e.status}">${statusLabels[e.status]}</span></td>
          <td class="price-text text-left">${formatCurrency(cachet)}</td>
          <td class="price-text text-left" style="color: var(--text-muted);">${logiCost > 0 ? '+' + formatCurrency(logiCost) : '—'}</td>
          <td class="price-text text-left" style="font-weight: 700;">${formatCurrency(totalValue)}</td>
          <td class="price-text text-left" style="color: #30d158;">${formatCurrency(amountReceived)}</td>
          <td class="price-text text-left" style="color: #ff453a;">${formatCurrency(amountToReceive)}</td>
          <td style="font-size: 11px; color: var(--text-muted);">${safeNotes}</td>
        `;
      } else {
        const aColor = appState.tagColors[e.artist] || "#4a4a52";
        const sColor = appState.tagColors[e.vendedor] || "#4a4a52";

        const artistStyle = `background-color: ${aColor}; border-color: ${aColor}; color: #ffffff;`;
        const sellerStyle = `background-color: ${sColor}; border-color: ${sColor}; color: #ffffff;`;

        row.innerHTML = `
          <td style="text-align: center;">
            <div class="event-checkbox ${checkClass}" data-id="${safeId}">
              ${checkIcon}
            </div>
          </td>
          <td><button class="inline-edit-select custom-dropdown-btn" style="${artistStyle} text-align: left;" data-id="${safeId}" data-field="artist">${safeArtist || '<span style="color:var(--text-muted);font-weight:normal;">Selecione</span>'}</button></td>
          <td><button class="inline-edit-select custom-dropdown-btn" style="${sellerStyle} text-align: left;" data-id="${safeId}" data-field="vendedor">${safeSeller || '<span style="color:var(--text-muted);font-weight:normal;">Selecione</span>'}</button></td>
          <td>
            <button class="inline-edit-select custom-dropdown-btn status-tag status-${e.status}" style="text-align: left;" data-id="${safeId}" data-field="status">${statusLabels[e.status] || escapeHtml(e.status)}</button>
          </td>
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: var(--text-main);" data-id="${safeId}" data-field="amount" value="${e.amount}">
          </td>
          <td class="price-text text-left" style="color: var(--text-muted);">${logiCost > 0 ? '+' + formatCurrency(logiCost) : '—'}</td>
          <td class="price-text text-left" style="font-weight: 700;">${formatCurrency(totalValue)}</td>
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: #30d158;" data-id="${safeId}" data-field="amountReceived" value="${amountReceived}">
          </td>
          <td class="price-text text-left" style="color: #ff453a; font-weight: 700;">${formatCurrency(amountToReceive)}</td>
          <td>
            <input type="text" class="inline-edit-input" style="width: 120px; font-size: 11px;" placeholder="Obs..." data-id="${safeId}" data-field="financeNotes" value="${safeNotes}">
          </td>
          <td style="font-size:11px; white-space:nowrap;">
            ${(() => {
            const st = getArtistLogisticsStatus(e.groupId || "", e.artist);
            if (st === 'concluida') return `<button class="btn-secondary logi-view-btn" data-key="${escapeHtml(e.groupId || '')}" data-artist="${escapeHtml(e.artist || '')}" style="padding:4px 10px; font-size:11px;">Ver Logística</button>`;
            const color = st === 'andamento' ? '#ff9f0a' : 'var(--text-muted)';
            return `<span style="color:${color};">${LOGI_STATUS_LABELS[st]}</span>`;
          })()}
          </td>
          ${isArtist ? '' : `<td style="text-align: center;">
            ${(!appState.currentRole || !appState.currentRole.includes("(Admin)")) ? '' : `<button class="action-icon-btn delete-btn" style="margin: 0 auto;" data-id="${safeId}" title="Excluir Show" aria-label="Excluir show">
              <svg viewBox="0 0 24 24">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path>
              </svg>
            </button>`}
          </td>`}
        `;
      }
      tbody.appendChild(row);
    });

    if (!isArtist) {
      const addRow = document.createElement("div");
      addRow.style.padding = "10px 15px";
      addRow.style.borderTop = "1px solid var(--border-color)";
      addRow.style.textAlign = "center";
      addRow.innerHTML = `
        <button class="btn-secondary add-artist-to-group-btn" data-key="${safeKey}" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; padding: 8px;">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Adicionar Artista a este Evento
        </button>
      `;
      const containerClassDiv = groupDiv.querySelector(`.${containerClass.split(' ').join('.')}`);
      if (containerClassDiv) {
        containerClassDiv.appendChild(addRow);
      }
    }

    container.appendChild(groupDiv);
  });

  // Attach Add Artist to Group events
  document.querySelectorAll(".add-artist-to-group-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const key = btn.getAttribute("data-key");
      const groupInfo = groups[key];
      const newEvent = {
        id: "evt-" + Date.now() + Math.floor(Math.random() * 1000),
        groupId: groupInfo.items[0] ? groupInfo.items[0].groupId : ("grp-" + Date.now()),
        event: groupInfo.event,
        date: groupInfo.date,
        venue: groupInfo.venue,
        estado: groupInfo.estado,
        artist: "",
        vendedor: "",
        status: "antes",
        amount: 0
      };
      appState.events.push(newEvent);
      saveState();
      renderEventTable();
      updateDashboard();
      renderTimeline();
    });
  });

  // Attach Delete Group events
  document.querySelectorAll(".delete-group-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent toggling the header

      showConfirmModal("Atenção", "Tem certeza que deseja excluir TODOS os artistas deste evento? Isso não pode ser desfeito.", () => {
        const key = btn.getAttribute("data-key");
        const groupInfo = groups[key];
        const eventIdsToDelete = groupInfo.items.map(ev => String(ev.id));

        appState.events = appState.events.filter(ev => !eventIdsToDelete.includes(String(ev.id)));

        // Delete from Supabase as well
        if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
          sbClient.from('events').delete().in('id', eventIdsToDelete).then(({ error }) => {
            if (error) console.error("Error deleting group from Supabase", error);
          });
        }

        saveState();
        deleteEventCard(key);
        renderEventTable();
        updateDashboard();
        renderTimeline();
        showToast("Evento excluído com sucesso!");
      });
    });
  });

  // Attach group header toggle events
  document.querySelectorAll(".event-group-header").forEach(header => {
    header.addEventListener("click", (e) => {
      if (['INPUT', 'SELECT'].includes(e.target.tagName) || e.target.closest('.custom-dropdown-btn') || e.target.closest('.group-estado-btn')) return;
      const key = header.getAttribute("data-key");
      if (window.collapsedGroups.has(key)) {
        window.collapsedGroups.delete(key);
      } else {
        window.collapsedGroups.add(key);
      }
      renderEventTable();
    });
  });

  // Attach group hidden input edits
  document.querySelectorAll(".group-title-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const key = e.target.getAttribute("data-key");
      const items = groups[key].items;
      updateGroupField(items, 'event', e.target.value);
    });
    // Adjust size dynamically to look like text
    input.addEventListener("input", (e) => {
      e.target.setAttribute("size", Math.max(e.target.value.length, 5));
    });
  });

  document.querySelectorAll(".group-date-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const key = e.target.getAttribute("data-key");
      const items = groups[key].items;

      let val = normalizeDate(e.target.value);
      // Check for same-day + same-state conflicts before updating
      const estado = (items[0] && items[0].estado || '').toUpperCase();
      let blocked = false;
      let warned = false;
      items.forEach(item => {
        if (item.artist && val && estado) {
          const check = checkArtistDateConflict(item.artist, val, estado, item.id);
          if (check.status === "blocked") {
            showWarningToast(check.message);
            blocked = true;
          } else if (check.status === "warned") {
            showWarningToast(check.message);
            warned = true;
          }
        }
      });
      if (blocked) {
        e.target.value = formatDate(items[0].date); // revert
        return;
      }
      updateGroupField(items, 'date', val);
    });
  });

  // Venue inline edit
  document.querySelectorAll(".group-venue-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const key = e.target.getAttribute("data-key");
      const items = groups[key].items;
      updateGroupField(items, 'venue', e.target.value);
    });
    input.addEventListener("input", (e) => {
      e.target.setAttribute("size", Math.max(e.target.value.length, 5));
    });
  });

  // Estado inline edit
  // Removed old group-estado-input listener as estado now uses custom-dropdown-btn

  if (!isArtist) {
    // Attach delete events
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        deleteEvent(id);
      });
    });

    document.querySelectorAll(".logi-view-btn").forEach(btn => {
      btn.addEventListener("click", () => openLogisticsViewModal(btn.getAttribute("data-key"), btn.getAttribute("data-artist")));
    });

    // Attach checkbox toggle events
    document.querySelectorAll(".event-checkbox[data-id]").forEach(cb => {
      cb.addEventListener("click", (e) => {
        const id = cb.getAttribute("data-id");
        const eventObj = appState.events.find(ev => String(ev.id) === String(id));
        if (eventObj) {
          eventObj.status = eventObj.status === "apos" ? "durante" : "apos";
          saveState();
          renderEventTable();
          updateDashboard();
          renderTimeline();
          showToast(eventObj.status === "apos" ? "Evento marcado como Concluído!" : "Evento marcado como Pendente/Durante!");
        }
      });
    });

    // Attach custom dropdown events for Artist and Seller
    document.querySelectorAll(".custom-dropdown-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = btn.getAttribute("data-id");
        const field = btn.getAttribute("data-field");
        openCustomDropdown(btn, id, field);
      });
    });

    // Attach inline edit events
    document.querySelectorAll(".inline-edit-input, .inline-edit-select").forEach(el => {
      el.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-id");
        const field = e.target.getAttribute("data-field");
        let val = e.target.value;
        if (field === "amount" || field === "amountReceived") val = parseFloat(val) || 0;

        if (field === "date") {
          val = normalizeDate(val);
        }

        const eventObj = appState.events.find(ev => String(ev.id) === String(id));
        if (eventObj) {
          let hasConflict = false;

          // Validate BEFORE persisting, so a blocked change is truly reverted.
          if (field === "artist") {
            const check = checkArtistDateConflict(val, eventObj.date, eventObj.estado, id);
            if (check.status === "blocked") {
              showWarningToast(check.message);
              renderEventTable(); // restore the original value in the UI
              return;
            } else if (check.status === "warned") {
              showWarningToast(check.message);
              hasConflict = true; // just to skip the success toast
            }
          }

          eventObj[field] = val;
          saveState();

          if (field === "status") {
            e.target.className = `inline-edit-select inline-status-${val}`;
          }
          if (field === "artist" || field === "vendedor") {
            const newColor = appState.tagColors[val] || "#ffffff";
            e.target.style.background = hexToRgba(newColor, 0.1);
            e.target.style.borderColor = hexToRgba(newColor, 0.3);
            e.target.style.color = newColor;
          }

          updateDashboard();
          renderTimeline();
          renderEventTable();

          if (!hasConflict) {
            showToast("Alteração salva com sucesso!", "success");
          }
        }
      });
    });
  }
}

function deleteEvent(id) {
  const ev = appState.events.find(e => String(e.id) === String(id));
  if (!ev) return;

  const groupId = ev.groupId;
  let isOnlyArtist = true;
  if (groupId) {
    const siblings = appState.events.filter(e => e.groupId === groupId);
    if (siblings.length > 1) {
      isOnlyArtist = false;
    }
  } else {
    const key = `${ev.event}|${ev.date}|${ev.venue}|${ev.estado || ''}`;
    const siblings = appState.events.filter(e => `${e.event}|${e.date}|${e.venue}|${e.estado || ''}` === key);
    if (siblings.length > 1) {
      isOnlyArtist = false;
    }
  }

  const msg = isOnlyArtist
    ? "Tem certeza que deseja excluir este evento inteiro?"
    : `Deseja remover o artista ${ev.artist || 'selecionado'} deste evento?`;

  showConfirmModal("Confirmação de Exclusão", msg, () => {
    appState.events = appState.events.filter(e => String(e.id) !== String(id));
    // Delete from Supabase as well
    if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
      sbClient.from('events').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Error deleting from Supabase", error);
      });
    }
    saveState();
    renderEventTable();
    updateDashboard();
    renderTimeline();
    showToast(isOnlyArtist ? "Show excluído com sucesso!" : "Artista removido do evento.");
  });
}

// 5. EVENT MODAL LOGIC
let artistBlockCounter = 0;

function addArtistBlock() {
  artistBlockCounter++;
  const container = document.getElementById("artist-list-container");

  const block = document.createElement("div");
  block.className = "artist-block";
  block.innerHTML = `
    <div class="artist-block-header">
      <span>🎤 Artista ${artistBlockCounter}</span>
      <button type="button" class="remove-artist-btn" title="Remover">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>Artista</label>
        <select class="form-control event-artist-input" required>
          <option value="" disabled selected>Selecione o artista</option>
          ${appState.artists.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Vendido Por</label>
        <select class="form-control event-seller-input" required>
          <option value="" disabled selected>Selecione quem vendeu</option>
          ${appState.sellers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>Status da Negociação</label>
        <select class="form-control event-status-input" required>
          <option value="antes">Em negociação</option>
          <option value="durante">Confirmado</option>
          <option value="apos">Concluído</option>
        </select>
      </div>
      <div class="form-group">
        <label>Valor (R$)</label>
        <input type="number" class="form-control event-amount-input" min="0" placeholder="0,00" required>
      </div>
    </div>
  `;
  container.appendChild(block);
}

function updateClientDropdown() {
  const select = document.getElementById("event-client");
  if (!select) return;
  const prev = select.value;
  const sorted = [...appState.clients].sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>' +
    sorted.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('') +
    '<option value="__new__" style="font-weight:bold; color:var(--yellow-primary);">+ Novo cliente...</option>';
  if (prev && sorted.some(c => c.id === prev)) select.value = prev;
}

function initEventModal() {
  const modal = document.getElementById("new-event-modal");
  const openBtn = document.getElementById("open-new-event-btn");
  const closeBtn = document.getElementById("close-event-modal-btn");
  const cancelBtn = document.getElementById("cancel-event-modal-btn");
  const form = document.getElementById("new-event-form");
  const addBlockBtn = document.getElementById("add-artist-block-btn");

  if (addBlockBtn) {
    addBlockBtn.addEventListener("click", () => {
      addArtistBlock();
    });
  }

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      form.reset();
      document.getElementById("artist-list-container").innerHTML = "";
      artistBlockCounter = 0;
      addArtistBlock(); // Renderiza pelo menos 1 bloco inicial
      updateClientDropdown();
      const quick = document.getElementById("event-client-quickadd");
      if (quick) quick.style.display = "none";
      document.getElementById("event-contract-status").value = "pendente";
      modal.classList.add("show");
      document.body.classList.add("modal-open");
    });
  }

  const closeModal = () => {
    modal.classList.remove("show");
    document.body.classList.remove("modal-open");
  };

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const eventName = document.getElementById("event-name").value;
    const eventDate = document.getElementById("event-date").value;
    const eventVenue = document.getElementById("event-venue").value;
    const eventEstado = document.getElementById("event-estado").value;
    const eventClientId = document.getElementById("event-client").value;
    const eventContractStatus = document.getElementById("event-contract-status").value || "pendente";
    if (!eventClientId || eventClientId === "__new__") {
      showWarningToast("Selecione (ou crie) o cliente dono do evento!");
      return;
    }

    // Validate estado
    if (!eventEstado) {
      showWarningToast("É obrigatório informar o Estado (UF) do evento!");
      return;
    }

    const artistBlocks = document.querySelectorAll(".artist-block");
    let hasWarning = false;
    let hasBlockingConflict = false;

    const groupId = "grp-" + Date.now(); // agrupará todos esses eventos

    // Pre-check for same-day + same-state conflicts BEFORE creating
    artistBlocks.forEach(block => {
      const eventArtist = block.querySelector(".event-artist-input").value;
      if (eventArtist && eventDate && eventEstado) {
        const check = checkArtistDateConflict(eventArtist, eventDate, eventEstado, null);
        if (check.status === "blocked") {
          showWarningToast(check.message);
          hasBlockingConflict = true;
        } else if (check.status === "warned") {
          hasWarning = true;
        }
      }
    });

    if (hasBlockingConflict) return;

    artistBlocks.forEach(block => {
      const eventArtist = block.querySelector(".event-artist-input").value;
      const eventSeller = block.querySelector(".event-seller-input").value;
      const eventStatus = block.querySelector(".event-status-input").value;
      const eventAmount = parseFloat(block.querySelector(".event-amount-input").value) || 0;

      const newEvent = {
        id: "evt-" + Date.now() + Math.floor(Math.random() * 1000),
        groupId: groupId,
        event: eventName,
        date: eventDate,
        venue: eventVenue,
        estado: eventEstado,
        artist: eventArtist,
        vendedor: eventSeller,
        status: eventStatus,
        amount: eventAmount,
        clientId: eventClientId,
        contractStatus: eventContractStatus
      };

      appState.events.push(newEvent);

      // Card do Kanban é criado/garantido a partir dos eventos (ver ensureCardsForEvents).
    });

    renderKanban();

    saveState();
    ensureCardsForEvents();
    renderEventTable();
    updateDashboard();
    renderTimeline();
    closeModal();

    setTimeout(() => {
      if (!hasWarning) {
        showToast("Show(s) cadastrado(s) com sucesso!", "success");
      }
    }, 100);
  });

  const clientSelect = document.getElementById("event-client");
  const quickBox = document.getElementById("event-client-quickadd");
  if (clientSelect) {
    clientSelect.addEventListener("change", () => {
      if (clientSelect.value === "__new__") {
        if (quickBox) quickBox.style.display = "block";
        document.getElementById("event-client-new-name").focus();
      } else if (quickBox) {
        quickBox.style.display = "none";
      }
    });
  }
  const quickSave = document.getElementById("event-client-quickadd-save");
  if (quickSave) {
    quickSave.addEventListener("click", () => {
      const name = document.getElementById("event-client-new-name").value.trim();
      const contact = document.getElementById("event-client-new-contact").value.trim();
      if (!name) { showWarningToast("Informe o nome do cliente."); return; }
      const newId = "cli-" + Date.now() + Math.floor(Math.random() * 1000);
      saveClient({ id: newId, name, contact });
      updateClientDropdown();
      clientSelect.value = newId;
      if (quickBox) quickBox.style.display = "none";
      document.getElementById("event-client-new-name").value = "";
      document.getElementById("event-client-new-contact").value = "";
      showToast(`Cliente ${name} adicionado e vinculado.`);
    });
  }
}

// 6. TIMELINE LOGIC
function renderTimeline() {
  const container = document.getElementById("timeline-container");
  container.innerHTML = "";

  let events = getFilteredEvents();

  // Filter timeline by selected artist if applicable
  const timelineArtistSelect = document.getElementById("timeline-artist-select");
  if (timelineArtistSelect) {
    const selectedArtist = timelineArtistSelect.value;
    if (selectedArtist !== "all") {
      events = events.filter(e => e.artist === selectedArtist);
    }
  }

  // Sort events chronologically
  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  if (events.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px;">
        Nenhum evento registrado na carreira desse artista para exibir na linha do tempo.
      </div>
    `;
    return;
  }

  events.forEach((e, idx) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    item.style.animationDelay = `${idx * 0.1}s`;

    const statusLabels = { antes: "Em negociação", durante: "Confirmado", apos: "Concluído" };
    const dateFormatted = formatDate(e.date);

    item.innerHTML = `
      <div class="timeline-content">
        <div class="timeline-date">${dateFormatted}</div>
        <h4 class="timeline-title">${escapeHtml(e.event || "")}</h4>
        <div class="timeline-desc">
          <strong>Local:</strong> ${escapeHtml(e.venue || "")}<br>
          <strong>Faturamento:</strong> ${formatCurrency(e.amount)}<br>
          <strong>Vendedor:</strong> ${escapeHtml(e.vendedor || "")}
        </div>
        <div class="timeline-badge">${statusLabels[e.status]}</div>
      </div>
    `;

    container.appendChild(item);
  });
}

// Add event listener to timeline artist selector
const timelineArtistSelect = document.getElementById("timeline-artist-select");
if (timelineArtistSelect) {
  timelineArtistSelect.addEventListener("change", renderTimeline);
}

// 8. CONFIGURATIONS
function initSettings() {
  const goalInput = document.getElementById("settings-goal-input");
  const saveGoalBtn = document.getElementById("save-goal-btn");
  const addArtistForm = document.getElementById("add-artist-form");
  const addSellerForm = document.getElementById("add-seller-form");

  // Set default goal value in input
  const currentName = appState.currentRole ? appState.currentRole.split(" (")[0] : "Admin";
  goalInput.value = appState.goals[currentName] || 500000;

  // Goal change
  saveGoalBtn.addEventListener("click", () => {
    const val = parseFloat(goalInput.value);
    const currentName = appState.currentRole ? appState.currentRole.split(" (")[0] : "Admin";
    if (!isNaN(val) && val > 0) {
      appState.goals[currentName] = val;
      saveState();
      updateDashboard();
      showToast("Meta anual atualizada com sucesso!");
    } else {
      showToast("Digite um valor válido para a meta.", "error");
    }
  });

  // Add Artist
  if (addArtistForm) {
    addArtistForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("new-artist-name");
      const emailInput = document.getElementById("new-artist-email");
      const colorInput = document.getElementById("new-artist-color");
      const name = nameInput.value.trim();
      const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      const color = colorInput ? colorInput.value : getRandomColor();

      if (name && !appState.artists.includes(name)) {
        appState.artists.push(name);
        appState.tagColors[name] = color;
        let finalEmail = email;
        if (!finalEmail) {
          const defaultEmails = {
            "raianlameira@hotmail.com": "Se7e",
            "contato.anotherreality@gmail.com": "Another Reality",
            "parallelusmusic@gmail.com": "Parallelus",
            "atomuz_@outlook.com": "Atomuz",
            "contatoartisticope@gmail.com": "Bug System",
            "giuseppebandini36@gmail.com": "Bandini"
          };
          const foundKey = Object.keys(defaultEmails).find(k => defaultEmails[k] === name);
          if (foundKey) finalEmail = foundKey;
        }

        if (finalEmail) {
          if (!appState.artistEmails) appState.artistEmails = {};
          appState.artistEmails[finalEmail] = name;
          if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
            sbClient.from('artist_emails').upsert({ email: finalEmail, artist_name: name }).then(({ error }) => {
              if (error) console.error("Error upserting artist_email", error);
            });
          }
        }
        saveState();
        nameInput.value = "";
        if (emailInput) emailInput.value = "";

        updateConfigLists();
        updateDropdownOptions();
        renderEventTable();
        showToast(`Artista ${name} adicionado com sucesso!`);
      } else {
        showWarningToast("Artista já cadastrado ou nome inválido.");
      }
    });
  }

  // Add Seller
  if (addSellerForm) {
    addSellerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("new-seller-name");
      const emailInput = document.getElementById("new-seller-email");
      const colorInput = document.getElementById("new-seller-color");
      const name = nameInput.value.trim();
      const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      const color = colorInput ? colorInput.value : getRandomColor();

      if (name && !appState.sellers.includes(name)) {
        appState.sellers.push(name);
        appState.tagColors[name] = color;
        if (email) {
          if (!appState.adminEmails) appState.adminEmails = {};
          appState.adminEmails[email] = name;
        }
        saveState();
        nameInput.value = "";
        if (emailInput) emailInput.value = "";

        updateConfigLists();
        updateDropdownOptions();
        renderEventTable();
        showToast(`Gerente ${name} adicionado à equipe com sucesso!`);
      } else {
        showWarningToast("Gerente já cadastrado ou nome inválido.");
      }
    });
  }
}

function updateConfigLists() {
  const statusSelect = document.getElementById("filter-status");
  if (statusSelect) {
    const currentVal = statusSelect.value;
    const customStatuses = [...new Set(appState.events.map(e => e.status))].filter(s => s && s !== "antes" && s !== "durante" && s !== "apos");
    statusSelect.innerHTML = `
      <option value="all">Todos os Status</option>
      <option value="antes">Em negociação</option>
      <option value="durante">Confirmado</option>
      <option value="apos">Concluído</option>
      ${customStatuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
    `;
    statusSelect.value = currentVal || "all";
  }

  const artistList = document.getElementById("config-artists-list");
  const sellerList = document.getElementById("config-sellers-list");

  if (artistList) {
    artistList.innerHTML = "";
    appState.artists.forEach(artist => {
      const color = appState.tagColors[artist] || "#ffcc00";
      let mappedEmail = "";
      let currentEmail = "";
      if (appState.artistEmails) {
        const found = Object.keys(appState.artistEmails).find(key => appState.artistEmails[key] === artist);
        if (found) {
          mappedEmail = ` <span style="color:var(--text-muted); font-size:11px; margin-left:8px;">(${found})</span>`;
          currentEmail = found;
        }
      }
      const item = document.createElement("div");
      item.className = "list-manager-item";
      const safeArtist = escapeHtml(artist);
      const safeEmail = escapeHtml(currentEmail);
      item.innerHTML = `
        <span class="list-manager-name" style="display:flex; align-items:center; gap:8px;">
          <input type="color" class="color-dot-input" data-name="${safeArtist}" value="${color}" title="Alterar cor de ${safeArtist}" aria-label="Cor de ${safeArtist}">
          ${safeArtist}${mappedEmail}
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="action-icon-btn edit-artist-btn" data-name="${safeArtist}" data-email="${safeEmail}" title="Editar Artista" aria-label="Editar artista ${safeArtist}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          ${(!appState.currentRole || !appState.currentRole.includes("(Admin)")) ? '' : `<button class="action-icon-btn delete-artist-btn" data-name="${safeArtist}" title="Excluir Artista" aria-label="Excluir artista ${safeArtist}">
            <svg viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>`}
        </div>
      `;
      artistList.appendChild(item);
    });

    // Attach edit handlers for artists
    document.querySelectorAll(".edit-artist-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const oldName = btn.getAttribute("data-name");
        const oldEmail = btn.getAttribute("data-email");

        showEditEntityModal("Editar Artista", oldName, oldEmail, (newName, newEmail) => {
          if (!newName || !newName.trim()) return;
          const nameTrimmed = newName.trim();
          const emailTrimmed = newEmail ? newEmail.trim().toLowerCase() : "";

          const nameChanged = (nameTrimmed !== oldName);

          // If name changed, verify it doesn't already exist
          if (nameChanged && appState.artists.includes(nameTrimmed)) {
            showWarningToast("Um artista com esse nome já existe!");
            return;
          }

          if (nameChanged) {
            // Update artists array
            const idx = appState.artists.indexOf(oldName);
            if (idx > -1) appState.artists[idx] = nameTrimmed;

            // Update tag colors
            if (appState.tagColors[oldName]) {
              appState.tagColors[nameTrimmed] = appState.tagColors[oldName];
              delete appState.tagColors[oldName];
            }

            // Update events
            appState.events.forEach(ev => {
              if (ev.artist === oldName) ev.artist = nameTrimmed;
            });

            // Supabase sync
            if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
              sbClient.from('events').update({ artist: nameTrimmed }).eq('artist', oldName).then(({ error }) => {
                if (error) console.error("Error updating artist in Supabase", error);
              });
            }
          }

          // Update Emails
          if (!appState.artistEmails) appState.artistEmails = {};

          // Remove old mapping regardless (we'll re-add if needed)
          Object.keys(appState.artistEmails).forEach(email => {
            if (appState.artistEmails[email] === oldName) {
              delete appState.artistEmails[email];
              if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
                sbClient.from('artist_emails').delete().eq('email', email).then(() => { });
              }
            }
          });

          if (emailTrimmed) {
            appState.artistEmails[emailTrimmed] = nameTrimmed;
            if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
              sbClient.from('artist_emails').upsert({ email: emailTrimmed, artist_name: nameTrimmed }).then(() => { });
            }
          }

          saveState();
          updateConfigLists();
          updateDropdownOptions();
          renderEventTable();
          showToast(`Artista ${nameTrimmed} atualizado.`);
        });
      });
    });

    // Attach delete handlers for artists
    document.querySelectorAll(".delete-artist-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-name");
        if (confirm(`Excluir o artista ${name} e todos os seus shows?`)) {
          appState.artists = appState.artists.filter(a => a !== name);
          appState.events = appState.events.filter(e => e.artist !== name);
          // Delete from email mapping
          if (appState.artistEmails) {
            Object.keys(appState.artistEmails).forEach(email => {
              if (appState.artistEmails[email] === name) {
                delete appState.artistEmails[email];
                if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
                  sbClient.from('artist_emails').delete().eq('email', email).then(() => { });
                }
              }
            });
          }
          saveState();
          updateDropdownOptions();
          updateConfigLists();
          updateDashboard();
          renderEventTable();
          renderTimeline();
          showToast(`Artista ${name} excluído.`);
        }
      });
    });
  }

  if (sellerList) {
    sellerList.innerHTML = "";
    appState.sellers.forEach(seller => {
      const color = appState.tagColors[seller] || "#9a9a9f";
      let mappedEmail = "";
      let currentEmail = "";

      const allTeamEmails = { ...appState.adminEmails, ...appState.bookerEmails };
      if (allTeamEmails) {
        const found = Object.keys(allTeamEmails).find(key => allTeamEmails[key] === seller);
        if (found) {
          mappedEmail = ` <span style="color:var(--text-muted); font-size:11px; margin-left:8px;">(${found})</span>`;
          currentEmail = found;
        }
      }

      const isIngrid = seller === "Ingrid (Master)" || seller === "Ingrid";
      const safeSeller = escapeHtml(seller);
      const safeEmail = escapeHtml(currentEmail);
      // Ingrid cannot be deleted (is primary admin)
      const deleteBtnHtml = (isIngrid || (!appState.currentRole || !appState.currentRole.includes("(Admin)"))) ? "" : `
        <button class="action-icon-btn delete-seller-btn" data-name="${safeSeller}" title="Excluir Vendedor" aria-label="Excluir vendedor ${safeSeller}">
          <svg viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      `;

      const item = document.createElement("div");
      item.className = "list-manager-item";
      item.innerHTML = `
        <span class="list-manager-name" style="display:flex; align-items:center; gap:8px;">
          <input type="color" class="color-dot-input" data-name="${safeSeller}" value="${color}" title="Alterar cor de ${safeSeller}" aria-label="Cor de ${safeSeller}">
          ${safeSeller}${isIngrid ? " (Master)" : ""}${mappedEmail}
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="action-icon-btn edit-seller-btn" data-name="${safeSeller}" data-email="${safeEmail}" title="Editar E-mail" aria-label="Editar e-mail do vendedor ${safeSeller}">
            <svg viewBox="0 0 24 24">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          ${deleteBtnHtml}
        </div>
      `;
      sellerList.appendChild(item);
    });

    // Attach edit handlers for sellers
    document.querySelectorAll(".edit-seller-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const oldName = btn.getAttribute("data-name");
        const oldEmail = btn.getAttribute("data-email");

        showEditEntityModal("Editar Vendedor", oldName, oldEmail, (newName, newEmail) => {
          if (!newName || !newName.trim()) return;
          const nameTrimmed = newName.trim();
          const emailTrimmed = newEmail ? newEmail.trim().toLowerCase() : "";

          const nameChanged = (nameTrimmed !== oldName);

          if (nameChanged && appState.sellers.includes(nameTrimmed)) {
            showWarningToast("Um vendedor com esse nome já existe!");
            return;
          }

          if (nameChanged) {
            // Update sellers array
            const idx = appState.sellers.indexOf(oldName);
            if (idx > -1) appState.sellers[idx] = nameTrimmed;

            // Update tag colors
            if (appState.tagColors[oldName]) {
              appState.tagColors[nameTrimmed] = appState.tagColors[oldName];
              delete appState.tagColors[oldName];
            }

            // Update events
            appState.events.forEach(ev => {
              if (ev.vendedor === oldName) ev.vendedor = nameTrimmed;
            });

            // Supabase sync
            if (appState.currentRole && typeof sbClient !== "undefined" && sbClient) {
              sbClient.from('events').update({ vendedor: nameTrimmed }).eq('vendedor', oldName).then(({ error }) => {
                if (error) console.error("Error updating seller in Supabase", error);
              });
            }
          }

          // Update Emails
          if (!appState.adminEmails) appState.adminEmails = {};
          if (!appState.bookerEmails) appState.bookerEmails = {};

          // Remove old mapping
          Object.keys(appState.adminEmails).forEach(email => {
            if (appState.adminEmails[email] === oldName) delete appState.adminEmails[email];
          });
          Object.keys(appState.bookerEmails).forEach(email => {
            if (appState.bookerEmails[email] === oldName) delete appState.bookerEmails[email];
          });

          if (emailTrimmed) {
            // Assume it's an admin if it's not a booker
            if (appState.bookerEmails[emailTrimmed] !== undefined || ["Heloísa", "Rayanne"].includes(nameTrimmed)) {
              appState.bookerEmails[emailTrimmed] = nameTrimmed;
            } else {
              appState.adminEmails[emailTrimmed] = nameTrimmed;
            }
          }

          saveState();
          updateConfigLists();
          updateDropdownOptions();
          renderEventTable();
          showToast(`Vendedor ${nameTrimmed} atualizado.`);
        });
      });
    });

    // Attach delete handlers for sellers
    document.querySelectorAll(".delete-seller-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-name");
        if (confirm(`Excluir o gerente/vendedor ${name}? Isso removerá a atribuição de vendas desse gerente nas metas.`)) {
          appState.sellers = appState.sellers.filter(s => s !== name);
          // Delete from email mapping
          if (appState.adminEmails) {
            Object.keys(appState.adminEmails).forEach(email => {
              if (appState.adminEmails[email] === name) {
                delete appState.adminEmails[email];
              }
            });
          }
          saveState();
          updateDropdownOptions();
          updateConfigLists();
          renderEventTable();
          showToast(`Vendedor ${name} removido da equipe.`);
        }
      });
    });
  }

  // Seletor de cor nativo (paleta completa) nas bolinhas
  document.querySelectorAll(".color-dot-input").forEach(inp => {
    inp.addEventListener("change", () => {
      const name = inp.getAttribute("data-name");
      appState.tagColors[name] = inp.value;
      saveState();
      updateConfigLists();
      renderEventTable();
      showToast("Cor da tag atualizada!");
    });
  });
}

let currentEditTag = null;
function initColorPicker() {
  const grid = document.getElementById("color-picker-grid");
  const popover = document.getElementById("color-picker-popover");

  // ClickUp Inspired Colors
  const PRESET_COLORS = ["#5e5ce6", "#0a84ff", "#40c8e0", "#30d158", "#ffcc00", "#ff9f0a", "#ff453a", "#ff375f", "#bf5af2", "#8e8e93", "#5c5c5c", "#1c1c1e"];

  PRESET_COLORS.forEach(color => {
    const swatch = document.createElement("div");
    swatch.className = "color-picker-swatch";
    swatch.style.backgroundColor = color;
    swatch.addEventListener("click", () => {
      if (currentEditTag) {
        appState.tagColors[currentEditTag] = color;
        saveState();
        popover.classList.add("hidden");
        updateConfigLists();
        renderEventTable();
        showToast(`Cor da tag atualizada!`);
      }
    });
    grid.appendChild(swatch);
  });

  // Close popover when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".color-picker-popover") && !e.target.closest(".color-dot")) {
      popover.classList.add("hidden");
    }
  });
}

// 9. UTILITIES
function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

// Deriva o status de pagamento de um artista a partir do valor e do recebido.
function getPaymentStatus(amount, received) {
  const total = parseFloat(amount) || 0;
  const paid = parseFloat(received) || 0;
  if (paid <= 0) return 'pendente';
  if (total > 0 && paid >= total) return 'pago_total';
  return 'sinal_pago';
}

// Status logístico de um artista: sem registro = 'pendente'.
function deriveLogisticsStatus(record) {
  if (!record) return 'pendente';
  return record.status || 'andamento';
}

// Converte um trecho (ida/volta) em pares [rótulo, valor] para exibição/PDF.
function legToFields(leg) {
  if (!leg || !leg.modo) return [];
  const modo = leg.modo;
  if (modo === 'carro_proprio') {
    return [['Transporte', 'Carro próprio']];
  }
  if (modo === 'uber') {
    return [['Transporte', 'Uber']];
  }
  if (modo === 'carro') {
    return [['Transporte', 'Carro / BlaBlaCar'], ['Saída', leg.saida || ''], ['Chegada', leg.chegada || ''],
    ['Ponto de encontro', leg.pontoEncontro || ''], ['Motorista', leg.motoristaNome || ''],
    ['Carro', leg.carroModelo || ''], ['Placa', leg.placa || '']];
  }
  if (modo === 'taxi') {
    return [['Transporte', 'Táxi'], ['Saída', leg.saida || ''], ['Chegada', leg.chegada || ''],
    ['Origem', leg.origem || ''], ['Destino', leg.destino || '']];
  }
  if (modo === 'onibus') {
    return [['Transporte', 'Ônibus'], ['Ida / Volta', leg.saida || ''], ['Chegada', leg.chegada || '']];
  }
  const pairs = [['Transporte', 'Avião'], ['Companhia', leg.companhia || ''], ['Voo', leg.voo || ''],
  ['Localizador', leg.localizador || ''], ['Partida', leg.partida || ''], ['Chegada', leg.chegada || ''],
  ['Recepção no destino', leg.recepcaoNome || ''], ['Veículo de apoio', leg.veiculoApoio || '']];
  (leg.conexoes || []).forEach((c, i) => {
    const parts = [c.cidade, c.espera && ('espera ' + c.espera),
    c.pernoite && ('pernoite: ' + [c.hotelNome, c.hotelEndereco].filter(Boolean).join(' — ')),
    c.translado && ('translado: ' + c.translado)].filter(Boolean).join(' · ');
    pairs.push([`Conexão ${i + 1}`, parts]);
  });
  return pairs;
}

// Dias entre uma data (YYYY-MM-DD) e "hoje" (YYYY-MM-DD). Negativo = passado.
function daysUntil(dateStr, todayStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date((todayStr || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}

// Normaliza uma data digitada (DD/MM/AAAA, DD-MM-AAAA, DD/MM/AA, AAAA-MM-DD,
// DDMMAAAA, DDMMAA) para o formato canônico AAAA-MM-DD. Entradas não
// reconhecidas voltam inalteradas. (Centraliza a lógica antes duplicada.)
function normalizeDate(input) {
  let val = (input == null) ? "" : String(input);
  const dStr = val.replace(/[^\d/\-]/g, '');
  if (dStr.includes('/') || dStr.includes('-')) {
    const separator = dStr.includes('/') ? '/' : '-';
    const parts = dStr.split(separator);
    if (parts.length >= 2) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      let y = parts[2] || new Date().getFullYear().toString();
      if (y.length === 2) y = '20' + y;
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${(parts[2] || '').padStart(2, '0')}`;
      }
      return `${y}-${m}-${d}`;
    }
    return val;
  } else if (dStr.length >= 6) {
    const d = dStr.slice(0, 2);
    const m = dStr.slice(2, 4);
    let y = dStr.slice(4);
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }
  return val;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return String(dateStr);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHtml(text) {
  // Coerção defensiva: nunca quebra com null/undefined/número (era causa de
  // telas em branco quando um campo vinha vazio/numérico do banco).
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseSimpleMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// Converte a mensagem técnica de erro (Supabase/rede) em texto amigável.
// O detalhe cru deve ir para o console pelo chamador; aqui só traduz.
function friendlyAuthError(raw) {
  const m = (raw || "").toString().toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (m.includes("already registered") || m.includes("already exists")) return "Este e-mail já está cadastrado.";
  if (m.includes("password") && (m.includes("at least") || m.includes("short") || m.includes("characters"))) return "A senha precisa ter ao menos 8 caracteres.";
  if (m.includes("captcha")) return "Confirme o CAPTCHA e tente novamente.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) return "Sem conexão com o servidor. Verifique sua internet.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um momento e tente de novo.";
  return "Algo deu errado. Tente novamente.";
}

function showAppLoading() {
  const el = document.getElementById("app-loading");
  if (el) el.style.display = "flex";
}
function hideAppLoading() {
  const el = document.getElementById("app-loading");
  if (el) el.style.display = "none";
}

// HTML de estado vazio padronizado.
function emptyStateHtml(msg) {
  return `<div class="empty-state">${escapeHtml(msg)}</div>`;
}

// Acessibilidade dos modais: Esc fecha, foco entra ao abrir e volta ao fechar,
// e Tab fica preso dentro do modal. Centralizado via observer das classes
// (todos os modais usam .modal-overlay + classe "show"), sem editar cada um.
function initModalA11y() {
  const overlays = document.querySelectorAll(".modal-overlay");
  let lastFocused = null;

  const focusablesOf = (modal) => [...modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null);

  const openModal = () => document.querySelector(".modal-overlay.show");

  overlays.forEach(ov => {
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    const obs = new MutationObserver(() => {
      if (ov.classList.contains("show")) {
        lastFocused = document.activeElement;
        const f = focusablesOf(ov);
        setTimeout(() => { (f[0] || ov).focus(); }, 30);
      } else if (lastFocused) {
        try { lastFocused.focus(); } catch (e) { }
        lastFocused = null;
      }
    });
    obs.observe(ov, { attributes: true, attributeFilter: ["class"] });
  });

  document.addEventListener("keydown", (e) => {
    const modal = openModal();
    if (!modal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      const closeBtn = modal.querySelector(".modal-close");
      if (closeBtn) closeBtn.click();
      else { modal.classList.remove("show"); document.body.classList.remove("modal-open"); }
    } else if (e.key === "Tab") {
      const f = focusablesOf(modal);
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

let syncStatusTimer = null;
// Indicador de sincronização: "saving" | "saved" | "offline".
function setSyncStatus(state) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  clearTimeout(syncStatusTimer);
  el.className = "sync-status sync-" + state;
  if (state === "saving") {
    el.textContent = "Salvando…";
  } else if (state === "saved") {
    el.textContent = "✓ Salvo";
    syncStatusTimer = setTimeout(() => { el.textContent = ""; el.className = "sync-status"; }, 2200);
  } else if (state === "offline") {
    el.textContent = "⚠ Sem conexão (salvo no aparelho)";
  }
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toast-text");
  const closeBtn = document.getElementById("toast-close");

  toastText.textContent = message;

  // Limpar classes antigas e adicionar a nova
  toast.className = "toast-msg";
  if (type) toast.classList.add(`toast-${type}`);
  toast.classList.add("show");

  if (closeBtn) {
    closeBtn.onclick = () => toast.classList.remove("show");
  }

  // Apenas sucesso fecha sozinho
  if (type === "success" || !type) {
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }
}

function showWarningToast(message) {
  const toastCenter = document.getElementById("toast-center");
  const toastCenterText = document.getElementById("toast-center-text");
  const closeBtn = document.getElementById("toast-center-close");

  if (!toastCenter || !toastCenterText) return;

  toastCenterText.textContent = message;
  toastCenter.classList.add("show");

  if (closeBtn) {
    closeBtn.onclick = () => toastCenter.classList.remove("show");
  }
}

function checkArtistDateConflict(artist, date, estado, currentEventId = null) {
  if (!artist || !date) return { status: "ok" };
  const conflicts = appState.events.filter(e => e.artist === artist && e.date === date && e.id !== currentEventId);
  if (conflicts.length > 0) {
    const estadoToCompare = (estado || '').toUpperCase();
    const sameStateConflict = conflicts.find(e => estadoToCompare && (e.estado || '').toUpperCase() === estadoToCompare);

    if (sameStateConflict) {
      return { status: "blocked", message: `⛔ ${artist} já tem uma festa no dia ${formatDate(date)} no estado ${estadoToCompare}! Mesmo dia e mesmo estado não é permitido.` };
    } else {
      return { status: "warned", message: `Aviso: ${artist} já tem um evento marcado nesta data em outro estado!` };
    }
  }
  return { status: "ok" };
}

function hexToRgba(hex, alpha) {
  let r = 255, g = 255, b = 255;
  if (hex && hex.startsWith('#')) {
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ----------------------------------------------------
// CUSTOM DROPDOWN LOGIC (Notion/ClickUp Style)
// ----------------------------------------------------

// Vibrant Palette for auto tags
const VIBRANT_PALETTE = [
  "#af52de", // Purple
  "#0a84ff", // Blue
  "#5e5ce6", // Indigo
  "#30d158", // Green
  "#ff9f0a", // Orange
  "#ff453a", // Red
  "#32ade6"  // Cyan
];

function getRandomColor() {
  return VIBRANT_PALETTE[Math.floor(Math.random() * VIBRANT_PALETTE.length)];
}

function openCustomDropdown(targetBtn, eventId, field) {
  // Check if targetBtn already has a popover open
  if (targetBtn.classList.contains("popover-open")) {
    const existing = document.querySelector(".custom-popover");
    if (existing) existing.remove();
    targetBtn.classList.remove("popover-open");
    return; // Close it and do not reopen
  }

  // Remove any existing popover from another button
  const existing = document.querySelector(".custom-popover");
  if (existing) {
    existing.remove();
    document.querySelectorAll(".popover-open").forEach(btn => btn.classList.remove("popover-open"));
  }

  // Mark this button as open
  targetBtn.classList.add("popover-open");

  const popover = document.createElement("div");
  popover.className = "custom-popover";
  if (field === "estado") {
    popover.style.width = "80px";
    popover.style.minWidth = "80px";
  }

  const placeholderText = field === "estado" ? "UF..." : "Pesquise ou adicione...";
  const maxLength = field === "estado" ? 'maxlength="2"' : '';

  popover.innerHTML = `
    <div class="custom-popover-search-container">
      <input type="text" class="custom-popover-search" placeholder="${placeholderText}" autocomplete="off" ${maxLength}>
    </div>
    <div class="custom-popover-options"></div>
  `;

  document.body.appendChild(popover);

  const searchInput = popover.querySelector(".custom-popover-search");
  const optionsContainer = popover.querySelector(".custom-popover-options");

  let optionsList = [];
  if (field === "artist") optionsList = appState.artists;
  else if (field === "vendedor") optionsList = appState.sellers;
  else if (field === "status") {
    const customStatuses = [...new Set(appState.events.map(e => e.status))].filter(s => s && s !== "antes" && s !== "durante" && s !== "apos");
    optionsList = ["Em negociação", "Confirmado", "Concluído", ...customStatuses];
  }
  else if (field === "contract") optionsList = ["Pendente", "Enviado", "Assinado"];
  else if (field === "estado") optionsList = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

  const statusMap = {
    "Em negociação": "antes",
    "Confirmado": "durante",
    "Concluído": "apos"
  };
  const contractMap = { "Pendente": "pendente", "Enviado": "enviado", "Assinado": "assinado" };

  function renderOptions(filterText = "") {
    optionsContainer.innerHTML = "";
    const lowerFilter = filterText.toLowerCase();
    const filtered = optionsList.filter(o => {
      if (field === "estado") return o.toLowerCase().startsWith(lowerFilter);
      return o.toLowerCase().includes(lowerFilter);
    });
    let exactMatch = false;



    filtered.forEach(opt => {
      if (opt.toLowerCase() === lowerFilter) exactMatch = true;
      const optDiv = document.createElement("div");
      optDiv.className = "custom-option-item";

      if (field === "status") {
        const val = statusMap[opt] || opt;
        let color = "#4a4a52";
        if (val === "antes") color = "#ff453a"; // Red
        else if (val === "durante") color = "#ff9f0a"; // Orange
        else if (val === "apos") color = "#30d158"; // Green
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: ${color}; border-color: ${color}; pointer-events: none;">${escapeHtml(opt)}</span>`;
      } else if (field === "contract") {
        const val = contractMap[opt] || opt;
        let color = "#4a4a52";
        if (val === "pendente") color = "#ff453a"; // Red
        else if (val === "enviado") color = "#ff9f0a"; // Orange
        else if (val === "assinado") color = "#30d158"; // Green
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: ${color}; border-color: ${color}; pointer-events: none;">${escapeHtml(opt)}</span>`;
      } else if (field === "estado") {
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: transparent; border: 1px solid var(--yellow-primary); color: var(--yellow-primary); pointer-events: none;">${escapeHtml(opt)}</span>`;
      } else {
        const optColor = appState.tagColors[opt] || "#4a4a52";
        optDiv.innerHTML = `<span class="custom-option-tag" style="background-color: ${optColor}; border-color: ${optColor};">${escapeHtml(opt)}</span>`;
      }

      optDiv.addEventListener("click", () => {
        let finalOpt = opt;
        if (field === "status") finalOpt = statusMap[opt] || opt;
        else if (field === "contract") finalOpt = contractMap[opt] || opt;
        applyDropdownSelection(eventId, field, finalOpt);
        popover.remove();
        targetBtn.classList.remove("popover-open");
      });
      optionsContainer.appendChild(optDiv);
    });

    if (field !== "contract" && field !== "estado" && filterText.trim() !== "" && !exactMatch) {
      const createDiv = document.createElement("div");
      createDiv.className = "custom-option-item custom-option-create";
      createDiv.textContent = `Criar "${filterText.trim()}"`;
      createDiv.addEventListener("click", () => {
        const newOpt = filterText.trim();
        if (field === "artist") appState.artists.push(newOpt);
        else if (field === "vendedor") appState.sellers.push(newOpt);
        
        if (field !== "status") {
          appState.tagColors[newOpt] = getRandomColor();
          saveState();
        }

        // Atualiza todas as listas e seletores nativos globalmente
        if (typeof updateDropdownOptions === "function") updateDropdownOptions();
        if (typeof updateConfigLists === "function") updateConfigLists();

        let finalOpt = newOpt;
        if (field === "status") finalOpt = statusMap[newOpt] || newOpt;

        applyDropdownSelection(eventId, field, finalOpt);
        popover.remove();
        targetBtn.classList.remove("popover-open");
      });
      optionsContainer.appendChild(createDiv);
    }
  }

  renderOptions();

  // Position logic
  const rect = targetBtn.getBoundingClientRect();
  popover.style.top = (rect.bottom + window.scrollY + 4) + "px";
  popover.style.left = (rect.left + window.scrollX) + "px";

  // Prevent input from closing popover on click
  popover.addEventListener("click", e => e.stopPropagation());

  searchInput.focus();
  searchInput.addEventListener("input", (e) => {
    let val = e.target.value;
    if (field === "estado") {
      val = val.toUpperCase();
      e.target.value = val;
      renderOptions(val);
      if (val.length === 2 && optionsList.includes(val)) {
        applyDropdownSelection(eventId, field, val);
        popover.remove();
        targetBtn.classList.remove("popover-open");
      }
    } else {
      renderOptions(val);
    }
  });

  // Close on outside click
  setTimeout(() => {
    const outsideClickListener = (e) => {
      if (!popover.contains(e.target) && e.target !== targetBtn) {
        popover.remove();
        targetBtn.classList.remove("popover-open");
        document.removeEventListener("click", outsideClickListener);
      }
    };
    document.addEventListener("click", outsideClickListener);
  }, 10);
}

function applyDropdownSelection(eventId, field, newValue) {
  const eventObj = appState.events.find(ev => ev.id === eventId);
  if (eventObj) {
    if (field === "contract" || field === "estado") {
      // Aplica a todos os artistas do mesmo grupo.
      const key = `${eventObj.event}|${eventObj.date}|${eventObj.venue}|${eventObj.estado || ''}`;

      if (field === "estado") {
        let blocked = false;
        const groupItems = appState.events.filter(ev => `${ev.event}|${ev.date}|${ev.venue}|${ev.estado || ''}` === key);
        groupItems.forEach(item => {
          if (item.artist && eventObj.date && newValue) {
            const check = checkArtistDateConflict(item.artist, eventObj.date, newValue, item.id);
            if (check.status === "blocked") {
              showWarningToast(check.message);
              blocked = true;
            } else if (check.status === "warned") {
              showWarningToast(check.message);
            }
          }
        });
        if (blocked) return;
      }

      appState.events.forEach(ev => {
        if (`${ev.event}|${ev.date}|${ev.venue}|${ev.estado || ''}` === key) ev[field] = newValue;
      });
    } else {
      eventObj[field] = newValue;
    }
    saveState();

    if (field === "artist") {
      checkArtistDateConflict(newValue, eventObj.date, eventId);
    }
    updateDashboard();
    renderTimeline();
    renderEventTable();
  }
}

function duplicateEventForNewArtist(eventId) {
  const eventObj = appState.events.find(ev => ev.id === eventId);
  if (eventObj) {
    const groupId = eventObj.groupId || ("grp-" + Date.now());
    eventObj.groupId = groupId; // Garante que o original tem o grupo

    const newEvent = {
      id: "evt-" + Date.now() + Math.floor(Math.random() * 1000),
      groupId: groupId,
      event: eventObj.event,
      date: eventObj.date,
      venue: eventObj.venue,
      estado: eventObj.estado,
      artist: "",
      vendedor: "",
      status: "antes",
      amount: 0
    };

    appState.events.push(newEvent);
    saveState();

    renderEventTable();
    updateDashboard();
    renderTimeline();

    showToast("Nova linha criada. Selecione o artista!", "success");
  }
}


// ----------------------------------------------------
// KANBAN DRAG AND DROP LOGIC
// ----------------------------------------------------
function initKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;

  // Clique no card abre o editor do evento
  board.addEventListener("click", (ev) => {
    const card = ev.target.closest(".kanban-card");
    if (!card || card.classList.contains("dragging")) return;
    openEventCardModal(card.getAttribute("data-group"));
  });

  // Drag & drop entre colunas
  board.querySelectorAll(".kanban-cards-container").forEach(col => {
    col.addEventListener("dragover", e => {
      e.preventDefault();
      const after = getKanbanDragAfter(col, e.clientY);
      const dragging = board.querySelector(".kanban-card.dragging");
      if (!dragging) return;
      if (after == null) col.appendChild(dragging); else col.insertBefore(dragging, after);
    });
    col.addEventListener("drop", () => {
      const dragging = board.querySelector(".kanban-card.dragging");
      if (!dragging) return;
      const newCol = dragging.closest(".kanban-cards-container")?.getAttribute("data-status");
      const gid = dragging.getAttribute("data-group");
      const card = getEventCard(gid);
      if (card && newCol && card.coluna !== newCol) { card.coluna = newCol; saveEventCard(card); }
      updateKanbanCounts();
    });
  });

  board.addEventListener("dragstart", e => {
    const card = e.target.closest(".kanban-card"); if (card) card.classList.add("dragging");
  });
  board.addEventListener("dragend", e => {
    const card = e.target.closest(".kanban-card"); if (card) card.classList.remove("dragging");
  });

  renderKanban();
}

function renderKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;
  const byGroup = {};
  (appState.events || []).forEach(e => {
    const gid = eventGroupKey(e);
    if (!byGroup[gid]) byGroup[gid] = { event: e.event, date: e.date, items: [] };
    byGroup[gid].items.push(e);
  });

  board.querySelectorAll(".kanban-cards-container").forEach(col => col.innerHTML = "");

  appState.eventCards.forEach(card => {
    const g = byGroup[card.groupId];
    const col = board.querySelector(`.kanban-cards-container[data-status="${card.coluna}"]`);
    if (!col) return;
    const name = g ? g.event : card.groupId;
    const date = g ? g.date : "";
    const artists = g ? [...new Set(g.items.map(i => i.artist).filter(Boolean))].join(", ") : "";
    const { feitos, total } = checklistProgress(card.checklist);
    const pct = total ? Math.round((feitos / total) * 100) : 0;
    const st = reminderState(card, new Date().toISOString().slice(0, 10));
    const bell = st === "atrasado" ? "🔴⏰" : (st === "chegando" ? "🟡⏰" : "");

    const el = document.createElement("div");
    el.className = "kanban-card";
    el.setAttribute("draggable", "true");
    el.setAttribute("data-group", card.groupId);
    el.innerHTML = `
      <div class="kanban-card-title">${escapeHtml(name)} ${bell}</div>
      <div class="kanban-card-desc">${date ? formatDate(date) : ""}${artists ? " · " + escapeHtml(artists) : ""}</div>
      <div class="kanban-progress"><div class="kanban-progress-bar" style="width:${pct}%"></div></div>
      <div class="kanban-progress-label">${feitos}/${total} etapas</div>
    `;
    col.appendChild(el);
  });
  updateKanbanCounts();
}

function showDueReminders() {
  if (!appState.currentRole || !appState.currentRole.includes("(Admin)")) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const due = collectDueReminders(appState.eventCards, appState.events, hoje);
  if (due.length === 0) return;
  const linhas = due.map(d => {
    const tag = d.estado_alerta === "atrasado" ? "⚠️ ATRASADO" : "⏰ chegando ao fim";
    return `${tag}: ${d.eventName}${d.estado ? " (" + d.estado + ")" : ""}`;
  }).join("\n");
  const titulo = due.length === 1 ? "Você tem 1 a fazer:" : `Você tem ${due.length} a fazer:`;
  showWarningToast(`${titulo}\n${linhas}`);
}

let currentCardGroup = null;

// Dropdown customizado do card (mesmo visual .custom-popover do resto do site).
// options: [{value, label}]. onPick(value) é chamado ao escolher.
function openCardSelect(btn, options, onPick) {
  const existing = document.querySelector(".card-select-pop");
  const wasOpen = btn.classList.contains("cs-open");
  if (existing) existing.remove();
  document.querySelectorAll(".card-dropdown.cs-open").forEach(b => b.classList.remove("cs-open"));
  if (wasOpen) return;
  btn.classList.add("cs-open");

  const pop = document.createElement("div");
  pop.className = "custom-popover card-select-pop";
  pop.innerHTML = `<div class="custom-popover-options">` +
    options.map(o => `<div class="custom-option-item" data-val="${escapeHtml(o.value)}">${o.label}</div>`).join("") +
    `</div>`;
  document.body.appendChild(pop);

  const rect = btn.getBoundingClientRect();
  pop.style.width = "auto";
  pop.style.minWidth = rect.width + "px";
  pop.style.top = (rect.bottom + window.scrollY + 4) + "px";
  pop.style.left = (rect.left + window.scrollX) + "px";

  pop.addEventListener("click", e => e.stopPropagation());
  pop.querySelectorAll(".custom-option-item").forEach(it => it.addEventListener("click", () => {
    const v = it.getAttribute("data-val");
    pop.remove();
    btn.classList.remove("cs-open");
    onPick(v);
  }));

  setTimeout(() => {
    const close = (e) => {
      if (!pop.contains(e.target) && !btn.contains(e.target) && e.target !== btn) {
        pop.remove();
        btn.classList.remove("cs-open");
        document.removeEventListener("click", close);
      }
    };
    document.addEventListener("click", close);
  }, 10);
}

function openEventCardModal(groupId) {
  const card = getEventCard(groupId);
  if (!card) return;
  currentCardGroup = groupId;
  const shows = appState.events.filter(e => eventGroupKey(e) === groupId);
  const ev0 = shows[0] || {};
  const body = document.getElementById("event-card-body");
  if (!body) return;
  document.getElementById("event-card-title").textContent = ev0.event || "Evento";

  const clientOpts = (appState.clients || []).map(c =>
    `<option value="${escapeHtml(c.id)}" ${ev0.clientId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const contractValues = [["pendente","Pendente"],["enviado","Enviado"],["assinado","Assinado"]];
  const contractOpts = contractValues.map(([v,t]) =>
    `<option value="${v}" ${ (ev0.contractStatus||"pendente")===v ? "selected":""}>${t}</option>`).join("");
  const statusValues = [["pre","Pré"],["apos","Pós"]];

  const chevSvg = `<svg class="card-dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  const modeBtn = (artist, leg, cur) => {
    const m = LEG_MODES.find(x => x[0] === cur);
    const label = cur ? `${MODE_ICONS[cur] || ""} ${m ? m[1] : cur}` : "— modo —";
    return `<button type="button" class="card-dropdown card-logi-mode" data-artist="${escapeHtml(artist)}" data-leg="${leg}" data-value="${escapeHtml(cur || "")}">
      <span class="card-dd-text">${escapeHtml(label)}</span>${chevSvg}
    </button>`;
  };
  const valInput = (artist, leg, val) => `<span class="card-cachet-wrap"><span class="card-cachet-cur">R$</span><input type="number" inputmode="decimal" class="card-logi-input" data-artist="${escapeHtml(artist)}" data-leg="${leg}" value="${parseFloat(val) || ''}" placeholder="0,00"></span>`;

  const lineup = shows.map(s => {
    const col = (appState.tagColors && appState.tagColors[s.artist]) || "#ffcc00";
    const ini = escapeHtml((s.artist || "?").trim().charAt(0).toUpperCase() || "?");
    const cachet = parseFloat(s.amount) || 0;
    const rec = getLogisticsRecord(s.groupId || groupId || "", s.artist);
    const d = (rec && rec.data) || {};
    const logiCost = getLogisticsCost(rec);
    const totalVal = cachet + logiCost;
    const temHosp = d.temHospedagem === true;
    return `
    <div class="card-lineup-row" data-id="${escapeHtml(String(s.id))}">
      <div class="card-lineup-top">
        <span class="card-chip" style="--chip:${escapeHtml(col)}">${ini}</span>
        <span class="card-lineup-artist">${escapeHtml(s.artist || "—")}</span>
        <button type="button" class="card-dropdown card-status-btn" data-id="${escapeHtml(String(s.id))}" data-value="${(s.status || "pre")}">
          <span class="card-dd-text">${(s.status || "pre") === "apos" ? "Pós" : "Pré"}</span>${chevSvg}
        </button>
        <button class="card-remove-show" data-id="${escapeHtml(String(s.id))}" title="Remover artista" aria-label="Remover artista">✕</button>
      </div>
      <div class="card-lineup-vals">
        <label class="card-val">
          <span class="card-val-label">Cachê</span>
          <span class="card-cachet-wrap"><span class="card-cachet-cur">R$</span><input type="number" inputmode="decimal" class="card-cachet" data-id="${escapeHtml(String(s.id))}" value="${cachet}"></span>
        </label>
        <span class="card-val-op">+</span>
        <div class="card-val">
          <span class="card-val-label">Logística</span>
          <span class="card-logi-val">${formatCurrency(logiCost)}</span>
        </div>
        <span class="card-val-op">=</span>
        <div class="card-val card-val--total">
          <span class="card-val-label">Total</span>
          <span class="card-total-val">${formatCurrency(totalVal)}</span>
        </div>
      </div>
      <div class="card-logi-edit">
        <div class="card-logi-leg">
          <span class="card-logi-tag">IDA</span>
          ${modeBtn(s.artist, "ida", (d.ida && d.ida.modo) || "")}
          ${valInput(s.artist, "ida", d.ida && d.ida.valor)}
        </div>
        <div class="card-logi-leg">
          <span class="card-logi-tag">VOLTA</span>
          ${modeBtn(s.artist, "volta", (d.volta && d.volta.modo) || "")}
          ${valInput(s.artist, "volta", d.volta && d.volta.valor)}
        </div>
        <div class="card-logi-leg card-logi-leg--hosp">
          <label class="card-logi-hosp">
            <input type="checkbox" class="card-logi-hosp-toggle" data-artist="${escapeHtml(s.artist || "")}" ${temHosp ? "checked" : ""}>
            <span>🏨 Hospedagem</span>
          </label>
          ${temHosp ? valInput(s.artist, "hotel", d.hotel && d.hotel.valor) : '<span class="card-logi-hosp-off">desligada</span>'}
        </div>
      </div>
    </div>`;
  }).join("");

  const checklist = (card.checklist || []).map((it, idx) => `
    <label class="card-check-item">
      <input type="checkbox" class="card-check" data-idx="${idx}" ${it.feito ? "checked" : ""}>
      <span class="card-check-box"></span>
      <span class="card-check-text ${it.feito ? 'done' : ''}">${escapeHtml(it.texto)}</span>
      <button class="card-check-remove" data-idx="${idx}" title="Remover etapa" aria-label="Remover etapa">✕</button>
    </label>`).join("");
  const { feitos, total } = checklistProgress(card.checklist);
  const pct = total ? Math.round((feitos / total) * 100) : 0;

  const l = card.lembrete || { data: "", ativo: false };

  body.innerHTML = `
    <div class="card-section">
      <div class="card-section-label">Dados do evento</div>
      <div class="form-row">
        <label class="card-field">Data <input type="text" id="card-date" value="${escapeHtml(ev0.date || "")}" placeholder="AAAA-MM-DD"></label>
        <label class="card-field">Local <input type="text" id="card-venue" value="${escapeHtml(ev0.venue || "")}" placeholder="Local"></label>
        <label class="card-field card-field--sm">Estado <input type="text" id="card-estado" value="${escapeHtml(ev0.estado || "")}" placeholder="UF"></label>
      </div>
      <div class="form-row">
        <label class="card-field">Cliente <select id="card-client">${clientOpts}</select></label>
        <label class="card-field">Contrato <select id="card-contract">${contractOpts}</select></label>
      </div>
    </div>

    <div class="card-section">
      <div class="card-section-label">Line-up <span class="card-section-count">${shows.length}</span></div>
      <div id="card-lineup" class="card-lineup">${lineup}</div>
    </div>

    <div class="card-section">
      <div class="card-section-label">Checklist <span class="card-section-count">${feitos}/${total}</span></div>
      <div class="card-check-progress"><div class="card-check-progress-bar" style="width:${pct}%"></div></div>
      <div id="card-checklist" class="card-checklist">${checklist}</div>
      <div class="card-add-step">
        <input type="text" id="card-new-step" placeholder="Adicionar etapa...">
        <button class="btn-secondary" id="card-add-step-btn">+ Etapa</button>
      </div>
    </div>

    <div class="card-section card-reminder">
      <div class="card-section-label">Lembrete (estilo alarme)</div>
      <div class="card-reminder-row">
        <label class="card-switch">
          <input type="checkbox" id="card-reminder-active" ${l.ativo ? "checked" : ""}>
          <span class="card-switch-slider"></span>
        </label>
        <input type="date" id="card-reminder-date" value="${escapeHtml(l.data || "")}">
        <span class="card-reminder-hint">Avisa no login se a data chegar ou passar</span>
      </div>
    </div>

    <div class="card-footer">
      <button class="btn-danger" id="card-delete-btn">Excluir card</button>
      <button class="btn-primary" id="card-save-btn">Salvar alterações</button>
    </div>
  `;

  wireEventCardModal(card, shows);
  document.getElementById("event-card-modal").classList.add("show");
  document.body.classList.add("modal-open");
}

function closeEventCardModal() {
  document.getElementById("event-card-modal").classList.remove("show");
  document.body.classList.remove("modal-open");
  currentCardGroup = null;
}

function wireEventCardModal(card, shows) {
  const eventDate = (shows[0] || {}).date || null;
  // Refletir alterações de logística em todo lugar (card, eventos, financeiro).
  const afterLogiChange = () => {
    openEventCardModal(card.groupId);
    if (typeof renderEventTable === "function") renderEventTable();
    if (typeof renderFinanceiroView === "function") renderFinanceiroView();
  };
  // Editar o MODO de um trecho (ida/volta) — dropdown customizado (padrão do site)
  document.querySelectorAll(".card-logi-mode").forEach(btn => btn.addEventListener("click", () => {
    const artist = btn.getAttribute("data-artist");
    const leg = btn.getAttribute("data-leg");
    const opts = [{ value: "", label: "— modo —" }].concat(
      LEG_MODES.map(([v, t]) => ({ value: v, label: `${MODE_ICONS[v] || ""} ${t}` }))
    );
    openCardSelect(btn, opts, (v) => {
      const rec = getOrCreateLogistics(card.groupId, artist, eventDate);
      rec.data[leg] = rec.data[leg] || {};
      if (v) rec.data[leg].modo = v; else delete rec.data[leg].modo;
      saveLogistics(rec);
      afterLogiChange();
    });
  }));
  // Status Pré/Pós — dropdown customizado
  document.querySelectorAll(".card-status-btn").forEach(btn => btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-id");
    openCardSelect(btn, [{ value: "pre", label: "Pré" }, { value: "apos", label: "Pós" }], (v) => {
      const s = appState.events.find(e => String(e.id) === id);
      if (s) { s.status = v; saveState(); if (typeof renderEventTable === "function") renderEventTable(); }
      openEventCardModal(card.groupId);
    });
  }));
  // Editar o VALOR de um trecho (ida/volta/hotel)
  document.querySelectorAll(".card-logi-input").forEach(inp => inp.addEventListener("change", () => {
    const artist = inp.getAttribute("data-artist");
    const leg = inp.getAttribute("data-leg");
    const rec = getOrCreateLogistics(card.groupId, artist, eventDate);
    const val = parseFloat(inp.value) || 0;
    if (leg === "hotel") { rec.data.hotel = rec.data.hotel || {}; rec.data.hotel.valor = val; }
    else { rec.data[leg] = rec.data[leg] || {}; rec.data[leg].valor = val; }
    saveLogistics(rec);
    afterLogiChange();
  }));
  // Ligar/desligar hospedagem
  document.querySelectorAll(".card-logi-hosp-toggle").forEach(chk => chk.addEventListener("change", () => {
    const artist = chk.getAttribute("data-artist");
    const rec = getOrCreateLogistics(card.groupId, artist, eventDate);
    rec.data.temHospedagem = chk.checked;
    if (chk.checked) { rec.data.hotel = rec.data.hotel || { valor: 0 }; }
    saveLogistics(rec);
    afterLogiChange();
  }));
  document.querySelectorAll(".card-check").forEach(chk => chk.addEventListener("change", () => {
    const idx = parseInt(chk.getAttribute("data-idx"));
    card.checklist[idx].feito = chk.checked;
    saveEventCard(card);
    openEventCardModal(card.groupId);
  }));
  document.querySelectorAll(".card-check-remove").forEach(b => b.addEventListener("click", () => {
    const idx = parseInt(b.getAttribute("data-idx"));
    card.checklist.splice(idx, 1);
    saveEventCard(card);
    openEventCardModal(card.groupId);
  }));
  const addStep = document.getElementById("card-add-step-btn");
  if (addStep) addStep.addEventListener("click", () => {
    const inp = document.getElementById("card-new-step");
    const txt = (inp.value || "").trim();
    if (!txt) return;
    card.checklist.push({ texto: txt, feito: false });
    saveEventCard(card);
    openEventCardModal(card.groupId);
  });
  document.querySelectorAll(".card-cachet").forEach(i => i.addEventListener("change", () => {
    const s = appState.events.find(e => String(e.id) === i.getAttribute("data-id"));
    if (s) { s.amount = parseFloat(i.value) || 0; saveState(); renderEventTable(); }
  }));
  document.querySelectorAll(".card-remove-show").forEach(b => b.addEventListener("click", () => {
    const id = b.getAttribute("data-id");
    appState.events = appState.events.filter(e => String(e.id) !== id);
    saveState(); renderEventTable();
    if (appState.events.some(e => eventGroupKey(e) === card.groupId)) openEventCardModal(card.groupId);
    else { deleteEventCard(card.groupId); closeEventCardModal(); renderKanban(); }
  }));
  document.getElementById("card-save-btn").addEventListener("click", () => {
    const date = document.getElementById("card-date").value.trim();
    const venue = document.getElementById("card-venue").value.trim();
    const estado = document.getElementById("card-estado").value.trim();
    const clientId = document.getElementById("card-client").value;
    const contract = document.getElementById("card-contract").value;
    appState.events.forEach(e => {
      if (eventGroupKey(e) === card.groupId) {
        e.date = date; e.venue = venue; e.estado = estado; e.clientId = clientId; e.contractStatus = contract;
      }
    });
    const ativo = document.getElementById("card-reminder-active").checked;
    const rdata = document.getElementById("card-reminder-date").value;
    card.lembrete = (rdata || ativo) ? { data: rdata, ativo } : null;
    saveEventCard(card);
    saveState(); renderEventTable(); renderKanban();
    showToast("Card atualizado.");
    closeEventCardModal();
  });
  document.getElementById("card-delete-btn").addEventListener("click", () => {
    deleteEventCard(card.groupId);
    closeEventCardModal(); renderKanban();
    showToast("Card removido.");
  });
}

function getKanbanDragAfter(container, y) {
  const els = [...container.querySelectorAll(".kanban-card:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateKanbanCounts() {
  document.querySelectorAll(".kanban-cards-container").forEach(col => {
    const header = col.parentElement?.querySelector(".kanban-column-header");
    if (header) header.setAttribute("data-count", col.querySelectorAll(".kanban-card").length);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initKanban();
  initFinanceiro();
  initModalA11y();
  const closeCardBtn = document.getElementById("close-event-card-modal");
  if (closeCardBtn) closeCardBtn.addEventListener("click", closeEventCardModal);
  const cardOverlay = document.getElementById("event-card-modal");
  if (cardOverlay) cardOverlay.addEventListener("click", (e) => { if (e.target === cardOverlay) closeEventCardModal(); });
});

// CUSTOM CONFIRM MODAL LOGIC
function showConfirmModal(title, msg, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  if (!modal) {
    // Fallback to native confirm if HTML is missing
    if (confirm(msg)) onConfirm();
    return;
  }

  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-msg');
  const btnOk = document.getElementById('confirm-modal-ok');
  const btnCancel = document.getElementById('confirm-modal-cancel');

  titleEl.textContent = title;
  msgEl.textContent = msg;

  modal.classList.add("show");

  // Handlers
  function handleOk() {
    closeModal();
    onConfirm();
  }

  function handleCancel() {
    closeModal();
  }

  function closeModal() {
    modal.classList.remove("show");
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
  }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
}

// CUSTOM PROMPT MODAL LOGIC
function showPromptModal(title, label, defaultValue, onConfirm) {
  const modal = document.getElementById('prompt-modal');
  if (!modal) {
    // Fallback
    const val = prompt(label, defaultValue);
    if (val !== null) onConfirm(val);
    return;
  }

  const titleEl = document.getElementById('prompt-modal-title');
  const labelEl = document.getElementById('prompt-modal-label');
  const inputEl = document.getElementById('prompt-modal-input');
  const btnOk = document.getElementById('prompt-modal-ok');
  const btnCancel = document.getElementById('prompt-modal-cancel');

  titleEl.textContent = title;
  labelEl.textContent = label;
  inputEl.value = defaultValue || "";

  modal.classList.add("show");
  inputEl.focus();

  function handleOk() {
    const val = inputEl.value;
    closeModal();
    onConfirm(val);
  }

  function handleCancel() {
    closeModal();
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOk();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  function closeModal() {
    modal.classList.remove("show");
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    inputEl.removeEventListener('keydown', handleKeydown);
  }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
  inputEl.addEventListener('keydown', handleKeydown);
}

// CUSTOM EDIT ENTITY MODAL LOGIC
function showEditEntityModal(title, defaultName, defaultEmail, onConfirm) {
  const modal = document.getElementById('edit-entity-modal');
  if (!modal) return;

  const titleEl = document.getElementById('edit-entity-modal-title');
  const inputName = document.getElementById('edit-entity-name');
  const inputEmail = document.getElementById('edit-entity-email');
  const btnOk = document.getElementById('edit-entity-ok');
  const btnCancel = document.getElementById('edit-entity-cancel');

  titleEl.textContent = title;
  inputName.value = defaultName || "";
  inputEmail.value = defaultEmail || "";

  modal.classList.add("show");
  inputName.focus();

  function handleOk() {
    const n = inputName.value;
    const e = inputEmail.value;
    closeModal();
    onConfirm(n, e);
  }

  function handleCancel() {
    closeModal();
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleOk();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  function closeModal() {
    modal.classList.remove("show");
    btnOk.removeEventListener('click', handleOk);
    btnCancel.removeEventListener('click', handleCancel);
    inputName.removeEventListener('keydown', handleKeydown);
    inputEmail.removeEventListener('keydown', handleKeydown);
  }

  btnOk.addEventListener('click', handleOk);
  btnCancel.addEventListener('click', handleCancel);
  inputName.addEventListener('keydown', handleKeydown);
  inputEmail.addEventListener('keydown', handleKeydown);
}

// ----------------------------------------------------
// Bloqueia interação (teclado + leitor de tela) da sidebar/app enquanto o
// login está visível. O CSS já cobre o mouse; aqui garantimos a acessibilidade
// aplicando o atributo `inert`. Centralizado num MutationObserver para pegar
// todos os pontos que mostram/escondem o overlay (login, logout, sessão).
(function guardSidebarDuringLogin() {
  function isLoginVisible(overlay) {
    if (!overlay) return false;
    if (overlay.classList.contains('hidden')) return false;
    return getComputedStyle(overlay).display !== 'none';
  }

  function syncInert() {
    const overlay = document.getElementById('login-overlay');
    const targets = [
      document.getElementById('sidebar'),
      document.querySelector('.main-wrapper'),
      document.getElementById('sidebar-backdrop'),
    ];
    const block = isLoginVisible(overlay);
    targets.forEach(el => {
      if (!el) return;
      if (block) el.setAttribute('inert', '');
      else el.removeAttribute('inert');
    });
  }

  function start() {
    const overlay = document.getElementById('login-overlay');
    if (!overlay) return;
    syncInert();
    // Observa mudanças de classe/estilo no overlay (toggle .hidden / display)
    new MutationObserver(syncInert).observe(overlay, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    // Observa também a classe do <html> (logged-in setado pela sessão)
    new MutationObserver(syncInert).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

function logisticsToday() { return new Date().toISOString().slice(0, 10); }

// Lista de (evento, artista) escalados a partir dos eventos da logística.
function logisticsScheduledRows() {
  return appState.logisticsEvents
    .filter(e => e.artist)
    .map(e => ({ eventKey: e.groupId, eventName: e.eventName, eventDate: e.eventDate, artist: e.artist }));
}

function renderLogisticsDashboard() {
  const kpis = document.getElementById("logistics-kpis");
  const alertBox = document.getElementById("logistics-deadline-alert");
  const list = document.getElementById("logistics-list");
  if (!kpis || !list) return;

  const rows = logisticsScheduledRows();
  let pend = 0, and = 0, conc = 0;
  rows.forEach(r => {
    const st = getArtistLogisticsStatus(r.eventKey, r.artist);
    if (st === 'pendente') pend++; else if (st === 'andamento') and++; else conc++;
  });

  kpis.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Pendentes</span><span class="kpi-value">${pend}</span><div class="kpi-meta"><span>Sem logística</span></div></div>
    <div class="kpi-card"><span class="kpi-label">Em Andamento</span><span class="kpi-value">${and}</span><div class="kpi-meta"><span>Rascunhos</span></div></div>
    <div class="kpi-card"><span class="kpi-label">Concluídas</span><span class="kpi-value">${conc}</span><div class="kpi-meta"><span>Finalizadas</span></div></div>`;

  const today = logisticsToday();
  const critical = rows.filter(r => {
    const st = getArtistLogisticsStatus(r.eventKey, r.artist);
    const dd = daysUntil(r.eventDate, today);
    return (st === 'pendente' || st === 'andamento') && dd >= 0 && dd <= 7;
  });
  if (alertBox) {
    alertBox.innerHTML = critical.length === 0 ? "" : `
      <div class="deadline-alert">
        ⚠️ <strong>${critical.length}</strong> logística(s) com prazo crítico (≤ 7 dias):
        ${escapeHtml(critical.map(c => `${c.artist} — ${c.eventName} (${formatDate(c.eventDate)})`).join("  •  "))}
      </div>`;
  }

  const groups = {};
  rows.forEach(r => {
    if (!groups[r.eventKey]) groups[r.eventKey] = { eventName: r.eventName, eventDate: r.eventDate, items: [] };
    groups[r.eventKey].items.push(r);
  });
  const keys = Object.keys(groups).sort((a, b) => new Date(groups[a].eventDate) - new Date(groups[b].eventDate));
  list.innerHTML = keys.length === 0
    ? emptyStateHtml("Nenhuma logística ainda.")
    : keys.map(k => {
      const g = groups[k];
      const itemsHtml = g.items.map(it => {
        const rec = getLogisticsRecord(it.eventKey, it.artist);
        const st = deriveLogisticsStatus(rec);
        const actions = st === 'pendente'
          ? `<button class="btn-secondary logi-fill-btn" data-key="${escapeHtml(it.eventKey)}" data-artist="${escapeHtml(it.artist)}">Preencher</button>`
          : `${st === 'concluida' ? `<button class="btn-secondary logi-view-dash-btn" data-key="${escapeHtml(it.eventKey)}" data-artist="${escapeHtml(it.artist)}">Ver / PDF</button>` : ''}
               <button class="btn-secondary logi-edit-btn" data-id="${escapeHtml(rec.id)}">Editar</button>
               <button class="action-icon-btn logi-split-btn" data-id="${escapeHtml(rec.id)}" title="Desmembrar" aria-label="Desmembrar artista">⤴</button>`;
        return `<div class="logi-row">
            <span>${escapeHtml(it.artist)}</span>
            <span class="badge badge-contract badge-contract-${st === 'concluida' ? 'assinado' : (st === 'andamento' ? 'enviado' : 'pendente')}">${LOGI_STATUS_LABELS[st]}</span>
            <span class="logi-row-actions">${actions}</span>
          </div>`;
      }).join("");
      return `<div class="event-group"><div class="event-group-header"><div class="event-group-title">
          <div class="event-group-field"><span class="event-group-field-label">Evento</span><strong>${escapeHtml(g.eventName)}</strong></div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field"><span class="event-group-field-label">Data</span><span>${formatDate(g.eventDate)}</span></div>
        </div></div><div class="event-table-container">${itemsHtml}</div></div>`;
    }).join("");

  list.querySelectorAll(".logi-fill-btn").forEach(b => b.addEventListener("click", () => {
    openLogisticsForm({ eventKey: b.getAttribute("data-key"), artists: [b.getAttribute("data-artist")] });
  }));
  list.querySelectorAll(".logi-edit-btn").forEach(b => b.addEventListener("click", () => {
    const rec = appState.logistics.find(r => r.id === b.getAttribute("data-id"));
    if (rec) openLogisticsForm({ existing: rec });
  }));
  list.querySelectorAll(".logi-split-btn").forEach(b => b.addEventListener("click", () => splitLogistics(b.getAttribute("data-id"))));
  list.querySelectorAll(".logi-view-dash-btn").forEach(b => b.addEventListener("click", () => openLogisticsViewModal(b.getAttribute("data-key"), b.getAttribute("data-artist"))));
}

function initFinanceiro() {
  const host = document.getElementById("financeiro-list");
  if (!host) return;
  host.addEventListener("change", (ev) => {
    const input = ev.target.closest(".fin-value-input");
    if (!input) return;
    const recId = input.getAttribute("data-rec");
    const legKey = input.getAttribute("data-leg");
    const rec = appState.logistics.find(r => r.id === recId);
    if (!rec) return;
    const val = parseFloat(input.value) || 0;
    rec.data = rec.data || {};
    if (legKey === "hotel") {
      rec.data.hotel = rec.data.hotel || {};
      rec.data.hotel.valor = val;
    } else {
      rec.data[legKey] = rec.data[legKey] || {};
      rec.data[legKey].valor = val;
    }
    saveLogistics(rec);
    renderFinanceiroView();
    if (typeof renderEventTable === "function") renderEventTable();
    showToast("Valor de logística salvo.");
  });
}

const MODE_ICONS = {
  carro_proprio: "⛽", carro: "🚗", uber: "🚙", taxi: "🚕", aviao: "✈️", onibus: "🚌"
};

function renderFinanceiroView() {
  const host = document.getElementById("financeiro-list");
  if (!host) return;

  const groups = {};
  appState.events.forEach(e => {
    const key = e.groupId || `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
    if (!groups[key]) groups[key] = { event: e.event, date: e.date, items: [] };
    groups[key].items.push(e);
  });

  const keys = Object.keys(groups);
  if (keys.length === 0) {
    host.innerHTML = `<div class="fin-empty">
      <div class="fin-empty-icon">💸</div>
      <p class="fin-empty-title">Nenhum evento cadastrado</p>
      <p class="fin-empty-sub">Crie um evento para começar a lançar os valores de logística.</p>
    </div>`;
    return;
  }

  let grandTotal = 0;

  const cardsHtml = keys.map(key => {
    const g = groups[key];
    let eventTotal = 0;

    const artistsHtml = g.items.map(e => {
      const rec = getLogisticsRecord(e.groupId || "", e.artist);
      const cost = getLogisticsCost(rec);
      eventTotal += cost;
      const safeArtist = escapeHtml(e.artist || "");
      const color = (appState.tagColors && appState.tagColors[e.artist]) || "#ffcc00";
      const initial = escapeHtml((e.artist || "?").trim().charAt(0).toUpperCase() || "?");

      if (!rec || !rec.data) {
        return `<div class="fin-artist fin-artist--empty">
          <div class="fin-artist-head">
            <span class="fin-chip" style="--chip:${escapeHtml(color)}">${initial}</span>
            <span class="fin-artist-name">${safeArtist}</span>
          </div>
          <span class="fin-pending">Defina a logística na aba Logística primeiro</span>
        </div>`;
      }

      const d = rec.data;
      const legRow = (legKey, leg) => {
        if (!leg || !leg.modo) return "";
        const label = COST_LABELS[leg.modo] || "Transporte";
        const icon = MODE_ICONS[leg.modo] || "•";
        const tag = legKey === "ida" ? "IDA" : "VOLTA";
        return `<label class="fin-leg">
          <span class="fin-leg-icon">${icon}</span>
          <span class="fin-leg-label"><span class="fin-leg-tag">${tag}</span>${escapeHtml(label)}</span>
          <span class="fin-input-wrap"><span class="fin-currency">R$</span>
            <input type="number" inputmode="decimal" class="fin-value-input" data-rec="${escapeHtml(rec.id)}" data-leg="${legKey}" value="${parseFloat(leg.valor) || ''}" placeholder="0,00">
          </span></label>`;
      };

      const hotelRow = (d.temHospedagem !== false && d.hotel)
        ? `<label class="fin-leg">
            <span class="fin-leg-icon">🏨</span>
            <span class="fin-leg-label"><span class="fin-leg-tag fin-leg-tag--alt">EST.</span>Hospedagem</span>
            <span class="fin-input-wrap"><span class="fin-currency">R$</span>
              <input type="number" inputmode="decimal" class="fin-value-input" data-rec="${escapeHtml(rec.id)}" data-leg="hotel" value="${parseFloat(d.hotel.valor) || ''}" placeholder="0,00">
            </span></label>`
        : "";

      return `<div class="fin-artist">
        <div class="fin-artist-head">
          <span class="fin-chip" style="--chip:${escapeHtml(color)}">${initial}</span>
          <span class="fin-artist-name">${safeArtist}</span>
          <span class="fin-artist-total ${cost > 0 ? 'has-value' : ''}">${formatCurrency(cost)}</span>
        </div>
        <div class="fin-legs">
          ${legRow("ida", d.ida)}
          ${legRow("volta", d.volta)}
          ${hotelRow}
        </div>
      </div>`;
    }).join("");

    grandTotal += eventTotal;

    return `<article class="fin-event">
      <header class="fin-event-head">
        <div class="fin-event-meta">
          <span class="fin-event-date">${g.date ? formatDate(g.date) : "—"}</span>
          <h3 class="fin-event-name">${escapeHtml(g.event || "Evento")}</h3>
          <span class="fin-event-count">${g.items.length} artista${g.items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="fin-event-total-wrap">
          <span class="fin-event-total-label">Logística do evento</span>
          <span class="fin-event-total">${formatCurrency(eventTotal)}</span>
        </div>
      </header>
      <div class="fin-event-body">${artistsHtml}</div>
    </article>`;
  }).join("");

  const summary = `<div class="fin-summary">
    <div class="fin-summary-item">
      <span class="fin-summary-label">Eventos</span>
      <span class="fin-summary-value">${keys.length}</span>
    </div>
    <div class="fin-summary-item fin-summary-item--gold">
      <span class="fin-summary-label">Total em logística</span>
      <span class="fin-summary-value">${formatCurrency(grandTotal)}</span>
    </div>
  </div>`;

  host.innerHTML = summary + `<div class="fin-grid">${cardsHtml}</div>`;
}

let logisticsCreateState = { eventKey: null };

function initLogisticsModule() {
  const openBtn = document.getElementById("open-new-logistics-btn");
  const createModal = document.getElementById("logistics-create-modal");
  if (!createModal) return;
  const eventSelect = document.getElementById("logistics-event-select");
  const artistsBox = document.getElementById("logistics-artists-container");
  const nextBtn = document.getElementById("logistics-create-next-btn");

  const closeCreate = () => createModal.classList.remove("show");
  document.getElementById("close-logistics-create-btn").addEventListener("click", closeCreate);
  document.getElementById("cancel-logistics-create-btn").addEventListener("click", closeCreate);

  if (openBtn) openBtn.addEventListener("click", () => {
    const today = logisticsToday();
    const evs = {};
    appState.logisticsEvents.forEach(e => {
      if (daysUntil(e.eventDate, today) >= 0) {
        if (!evs[e.groupId]) evs[e.groupId] = { name: e.eventName, date: e.eventDate };
      }
    });
    const keys = Object.keys(evs).sort((a, b) => new Date(evs[a].date) - new Date(evs[b].date));
    eventSelect.innerHTML = '<option value="" disabled selected>Selecione o evento</option>' +
      keys.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(evs[k].name)} — ${formatDate(evs[k].date)}</option>`).join("");
    artistsBox.innerHTML = "";
    createModal.classList.add("show");
  });

  eventSelect.addEventListener("change", () => {
    const key = eventSelect.value;
    const artists = appState.logisticsEvents.filter(e => e.groupId === key && e.artist).map(e => e.artist);
    artistsBox.innerHTML = artists.length === 0
      ? `<span style="color:var(--text-muted); font-size:13px;">Nenhum artista neste evento.</span>`
      : artists.map(a => `<label style="display:flex; gap:8px; align-items:center;">
          <input type="checkbox" class="logi-artist-check" value="${escapeHtml(a)}"> ${escapeHtml(a)}</label>`).join("");
  });

  nextBtn.addEventListener("click", () => {
    const key = eventSelect.value;
    const chosen = Array.from(artistsBox.querySelectorAll(".logi-artist-check:checked")).map(c => c.value);
    if (!key) { showWarningToast("Selecione o evento."); return; }
    if (chosen.length === 0) { showWarningToast("Selecione ao menos um artista."); return; }
    closeCreate();
    openLogisticsForm({ eventKey: key, artists: chosen });
  });

  const formModal = document.getElementById("logistics-form-modal");
  document.getElementById("close-logistics-form-btn").addEventListener("click", () => formModal.classList.remove("show"));

  function persistLogistics(finalize) {
    if (!logisticsFormCtx) return;
    const data = collectLogisticsData();
    const ev = appState.logisticsEvents.find(e => e.groupId === logisticsFormCtx.eventKey);
    const eventDate = ev ? ev.eventDate : null;
    const status = finalize ? 'concluida' : 'andamento';
    let groupId = logisticsFormCtx.existing ? logisticsFormCtx.existing.groupId : ("lgrp-" + Date.now());
    logisticsFormCtx.artists.forEach(artist => {
      const prev = getLogisticsRecord(logisticsFormCtx.eventKey, artist);
      const rec = {
        id: prev ? prev.id : ("log-" + Date.now() + Math.floor(Math.random() * 1000)),
        eventKey: logisticsFormCtx.eventKey, eventDate, artist,
        groupId: prev && prev.groupId ? prev.groupId : groupId,
        status, data
      };
      saveLogistics(rec);
    });
    formModal.classList.remove("show");
    renderLogisticsDashboard();
    if (typeof renderEventTable === "function") renderEventTable();
    showToast(finalize ? "Logística finalizada!" : "Rascunho salvo.");
  }
  document.getElementById("logistics-save-draft-btn").addEventListener("click", () => persistLogistics(false));
  document.getElementById("logistics-finalize-btn").addEventListener("click", () => persistLogistics(true));

  const viewModal = document.getElementById("logistics-view-modal");
  if (viewModal) {
    const closeView = () => viewModal.classList.remove("show");
    document.getElementById("close-logistics-view-btn").addEventListener("click", closeView);
    document.getElementById("logistics-view-close-footer-btn").addEventListener("click", closeView);
    document.getElementById("logistics-export-pdf-btn").addEventListener("click", () => {
      if (logisticsViewCurrent) printLogistics(logisticsViewCurrent.eventKey, logisticsViewCurrent.artist);
    });
    // NÃO há listener de clique fora — o modal só fecha no X/Fechar.
  }
}

const LEG_MODES = [["carro_proprio", "Carro próprio"], ["carro", "Carro / BlaBlaCar"], ["uber", "Uber"], ["taxi", "Táxi"], ["aviao", "Avião"], ["onibus", "Ônibus"]];

function logiInput(id, label, value) {
  return `<div class="form-group"><label for="${id}">${label}</label>
    <input type="text" id="${id}" class="form-control" value="${escapeHtml(value || "")}"></div>`;
}

function renderLegFields(prefix, modo, data) {
  const d = data || {};
  if (modo === "carro_proprio" || modo === "uber") {
    return `<p style="color:var(--text-muted); font-size:13px; margin-top:8px;">Transporte direto, não requer preenchimento de detalhes.</p>`;
  }
  if (modo === "carro") {
    return logiInput(`${prefix}-saida`, "Saída", d.saida) + logiInput(`${prefix}-chegada`, "Chegada prevista", d.chegada) +
      logiInput(`${prefix}-pontoEncontro`, "Ponto de encontro", d.pontoEncontro) +
      logiInput(`${prefix}-motoristaNome`, "Motorista (nome)", d.motoristaNome) +
      logiInput(`${prefix}-carroModelo`, "Modelo do carro", d.carroModelo) + logiInput(`${prefix}-placa`, "Placa", d.placa);
  }
  if (modo === "taxi") {
    return logiInput(`${prefix}-saida`, "Saída", d.saida) + logiInput(`${prefix}-chegada`, "Chegada prevista", d.chegada) +
      logiInput(`${prefix}-origem`, "Origem", d.origem) + logiInput(`${prefix}-destino`, "Destino", d.destino);
  }
  if (modo === "onibus") {
    const isVolta = prefix.includes("volta");
    const labelSaida = isVolta ? "Hora de volta da passagem" : "Hora de ida da passagem";
    return logiInput(`${prefix}-saida`, labelSaida, d.saida) + logiInput(`${prefix}-chegada`, "Hora de chegada da passagem", d.chegada);
  }
  const conns = (d.conexoes || []).map((c, i) => connectionHTML(prefix, i, c)).join("");
  return logiInput(`${prefix}-companhia`, "Companhia aérea", d.companhia) + logiInput(`${prefix}-voo`, "Número do voo", d.voo) +
    logiInput(`${prefix}-localizador`, "Código localizador", d.localizador) +
    logiInput(`${prefix}-partida`, "Partida", d.partida) + logiInput(`${prefix}-chegada`, "Chegada", d.chegada) +
    logiInput(`${prefix}-recepcaoNome`, "Recepção no destino (responsável)", d.recepcaoNome) +
    logiInput(`${prefix}-veiculoApoio`, "Veículo de apoio", d.veiculoApoio) +
    `<div class="form-group"><label>Conexões</label><div id="${prefix}-conexoes">${conns}</div>
      <button type="button" class="btn-secondary logi-add-conn" data-prefix="${prefix}" style="margin-top:8px;">+ Adicionar conexão</button></div>`;
}

function connectionHTML(prefix, i, c) {
  c = c || {};
  return `<div class="logi-conn" style="border:1px dashed var(--border-color); border-radius:8px; padding:10px; margin-bottom:8px;">
    ${logiInput(`${prefix}-conn-${i}-cidade`, "Cidade da conexão", c.cidade)}
    ${logiInput(`${prefix}-conn-${i}-espera`, "Tempo de espera", c.espera)}
    <label style="display:flex; gap:8px; align-items:center; margin:6px 0;">
      <input type="checkbox" class="logi-conn-pernoite" id="${prefix}-conn-${i}-pernoite" ${c.pernoite ? "checked" : ""}> Pernoite na conexão</label>
    <div id="${prefix}-conn-${i}-hotel-wrap" style="display: ${c.pernoite ? 'block' : 'none'};">
      ${logiInput(`${prefix}-conn-${i}-hotelNome`, "Hotel da escala", c.hotelNome)}
      ${logiInput(`${prefix}-conn-${i}-hotelEndereco`, "Endereço do hotel", c.hotelEndereco)}
      ${logiInput(`${prefix}-conn-${i}-translado`, "Translado local", c.translado)}
    </div>
  </div>`;
}

function legSectionHTML(prefix, label, leg) {
  const modo = (leg && leg.modo) || "carro";
  const opts = LEG_MODES.map(([v, t]) => `<option value="${v}" ${modo === v ? "selected" : ""}>${t}</option>`).join("");
  return `<h4 style="margin:18px 0 10px;">${label}</h4>
    <div class="form-group"><label for="${prefix}-modo">Transporte</label>
      <select id="${prefix}-modo" class="form-control logi-mode-select" data-prefix="${prefix}">${opts}</select></div>
    <div id="${prefix}-fields">${renderLegFields(prefix, modo, leg)}</div>`;
}

let logisticsFormCtx = null;

function openLogisticsForm(ctx) {
  const modal = document.getElementById("logistics-form-modal");
  const body = document.getElementById("logistics-form-body");
  if (!modal || !body) return;

  let eventKey, artists, existing = null, data = {};
  if (ctx.existing) {
    existing = ctx.existing; eventKey = existing.eventKey;
    artists = appState.logistics.filter(r => r.groupId && r.groupId === existing.groupId).map(r => r.artist);
    if (artists.length === 0) artists = [existing.artist];
    data = existing.data || {};
  } else {
    eventKey = ctx.eventKey; artists = ctx.artists || []; data = {};
  }
  logisticsFormCtx = { eventKey, artists, existing };

  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  document.getElementById("logistics-form-title").textContent = "Logística — " + (ev ? ev.eventName : "");
  document.getElementById("logistics-form-artists").textContent = "Artistas: " + artists.join(", ");

  const h = data.hotel || {};
  const temHospedagem = data.temHospedagem !== false;
  body.innerHTML = `
    <h4 style="margin:4px 0 10px;">Hospedagem principal</h4>
    <div class="form-group" style="margin-bottom: 14px;">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
        <input type="checkbox" id="log-tem-hospedagem" ${temHospedagem ? "checked" : ""}>
        Evento possui hospedagem vinculada
      </label>
    </div>
    <div id="log-hospedagem-fields" style="${temHospedagem ? 'display:block;' : 'display:none;'}">
      ${logiInput("log-hotel-nome", "Hotel / acomodação", h.nome)}
      ${logiInput("log-hotel-endereco", "Endereço", h.endereco)}
      <div class="form-row-2">${logiInput("log-hotel-checkin", "Check-in (data + hora)", h.checkin)}${logiInput("log-hotel-checkout", "Check-out (data + hora)", h.checkout)}</div>
    </div>
    ${legSectionHTML("log-ida", "Ida", data.ida)}
    ${legSectionHTML("log-volta", "Volta", data.volta)}`;

  const chkHosp = document.getElementById("log-tem-hospedagem");
  if (chkHosp) {
    chkHosp.addEventListener("change", (e) => {
      document.getElementById("log-hospedagem-fields").style.display = e.target.checked ? "block" : "none";
    });
  }

  body.querySelectorAll(".logi-mode-select").forEach(sel => sel.addEventListener("change", () => {
    const prefix = sel.getAttribute("data-prefix");
    document.getElementById(`${prefix}-fields`).innerHTML = renderLegFields(prefix, sel.value, {});
    attachAddConn(body);
  }));
  attachAddConn(body);
  modal.classList.add("show");
}

function attachAddConn(scope) {
  scope.querySelectorAll(".logi-add-conn").forEach(btn => {
    btn.onclick = () => {
      const prefix = btn.getAttribute("data-prefix");
      const box = document.getElementById(`${prefix}-conexoes`);
      const i = box.querySelectorAll(".logi-conn").length;
      box.insertAdjacentHTML("beforeend", connectionHTML(prefix, i, {}));
    };
  });
}

function collectLeg(prefix) {
  const modo = document.getElementById(`${prefix}-modo`).value;
  if (modo === "carro_proprio" || modo === "uber") return { modo };
  const v = (suffix) => { const el = document.getElementById(`${prefix}-${suffix}`); return el ? el.value.trim() : ""; };
  if (modo === "carro") return { modo, saida: v("saida"), chegada: v("chegada"), pontoEncontro: v("pontoEncontro"), motoristaNome: v("motoristaNome"), carroModelo: v("carroModelo"), placa: v("placa") };
  if (modo === "taxi") return { modo, saida: v("saida"), chegada: v("chegada"), origem: v("origem"), destino: v("destino") };
  if (modo === "onibus") return { modo, saida: v("saida"), chegada: v("chegada") };
  const conexoes = [];
  document.querySelectorAll(`#${prefix}-conexoes .logi-conn`).forEach((row, i) => {
    const cv = (s) => { const el = document.getElementById(`${prefix}-conn-${i}-${s}`); return el ? el.value.trim() : ""; };
    const per = document.getElementById(`${prefix}-conn-${i}-pernoite`);
    conexoes.push({ cidade: cv("cidade"), espera: cv("espera"), pernoite: per ? per.checked : false, hotelNome: cv("hotelNome"), hotelEndereco: cv("hotelEndereco"), translado: cv("translado") });
  });
  return { modo, companhia: v("companhia"), voo: v("voo"), localizador: v("localizador"), partida: v("partida"), chegada: v("chegada"), recepcaoNome: v("recepcaoNome"), veiculoApoio: v("veiculoApoio"), conexoes };
}

function collectLogisticsData() {
  const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const temHospedagem = document.getElementById("log-tem-hospedagem") ? document.getElementById("log-tem-hospedagem").checked : true;
  return {
    temHospedagem,
    hotel: temHospedagem ? { nome: g("log-hotel-nome"), endereco: g("log-hotel-endereco"), checkin: g("log-hotel-checkin"), checkout: g("log-hotel-checkout") } : null,
    ida: collectLeg("log-ida"),
    volta: collectLeg("log-volta")
  };
}

let logisticsViewCurrent = null; // { eventKey, artist }

function fieldsTableHTML(pairs) {
  const rows = pairs.filter(([, v]) => v !== undefined)
    .map(([label, value]) => `<tr><td style="padding:4px 10px; color:var(--text-muted); white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:4px 10px;">${escapeHtml(value || "—")}</td></tr>`).join("");
  return `<table style="width:100%; border-collapse:collapse; font-size:13px;">${rows}</table>`;
}

function logisticsDossierHTML(record, ev) {
  const d = (record && record.data) || {};
  let hotelHTML = "";
  if (d.temHospedagem !== false) {
    const h = d.hotel || {};
    const hotelPairs = [["Hotel / acomodação", h.nome || ""], ["Endereço", h.endereco || ""],
    ["Check-in", h.checkin || ""], ["Check-out", h.checkout || ""]];
    hotelHTML = `<h4 style="margin:10px 0 6px;">Hospedagem principal</h4>${fieldsTableHTML(hotelPairs)}`;
  } else {
    hotelHTML = `<h4 style="margin:10px 0 6px;">Hospedagem</h4><p style="color:var(--text-muted); font-size:13px; margin:0 0 10px;">Sem hospedagem vinculada.</p>`;
  }
  const evName = ev ? ev.eventName : "";
  const evDate = ev ? formatDate(ev.eventDate) : "";
  return `
    <div class="logi-dossier">
      <p style="margin:0 0 14px; color:var(--text-muted); font-size:13px;">
        <strong style="color:var(--text-main);">${escapeHtml(record.artist || "")}</strong> — ${escapeHtml(evName)} ${evDate ? "(" + evDate + ")" : ""}
      </p>
      ${hotelHTML}
      <h4 style="margin:16px 0 6px;">Ida</h4>${fieldsTableHTML(legToFields(d.ida))}
      <h4 style="margin:16px 0 6px;">Volta</h4>${fieldsTableHTML(legToFields(d.volta))}
    </div>`;
}

function openLogisticsViewModal(eventKey, artist) {
  const modal = document.getElementById("logistics-view-modal");
  const body = document.getElementById("logistics-view-body");
  if (!modal || !body) return;
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) { showWarningToast("Logística não encontrada."); return; }
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  logisticsViewCurrent = { eventKey, artist };
  document.getElementById("logistics-view-title").textContent = "Roteiro — " + artist;
  body.innerHTML = logisticsDossierHTML(record, ev);
  modal.classList.add("show"); // NÃO adicionar listener de clique-fora: só X/Fechar fecham
}

function printLogistics(eventKey, artist) {
  const record = getLogisticsRecord(eventKey, artist);
  if (!record) return;
  const ev = appState.logisticsEvents.find(e => e.groupId === eventKey);
  const area = document.getElementById("logistics-print-area");
  if (!area) return;
  area.innerHTML = `<div class="logi-print-doc">
    <h2 style="margin:0 0 4px;">Roteiro de Viagem</h2>
    ${logisticsDossierHTML(record, ev)}
  </div>`;
  window.print();
}

// ----------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatCurrency,
    hexToRgba,
    getRandomColor,
    getPaymentStatus,
    deriveLogisticsStatus,
    legToFields,
    daysUntil,
    getLogisticsCost,
    DEFAULT_CHECKLIST,
    checklistProgress,
    reminderState,
    collectDueReminders,
    COST_LABELS,
    friendlyAuthError,
    normalizeDate,
    escapeHtml,
    clearLocalPII,
  };
}

