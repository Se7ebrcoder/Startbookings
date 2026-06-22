# Módulo de Logística — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a base operacional do módulo de Logística: cargo `Logistica` com acesso restrito, dashboard com KPIs e alerta de prazo, criação em cascata (evento → artistas), formulário de estadia + trajetos ida/volta (carro/uber/avião com conexões), rascunho/finalizar, desmembrar e indicadores de status por artista na tabela de eventos.

**Architecture:** SPA vanilla JS (`app-v2.js`) + Supabase. Nova tabela `logistics` (1 linha por artista/evento, `data` em JSONB), papel `Logistica` em `profiles`, função segura `logistics_events()` (sem financeiro) consumida via RPC. Estado em `appState.logistics`/`appState.logisticsEvents`. UI esconde tudo menos a aba Logística para o papel `role-logistica`.

**Tech Stack:** HTML/CSS/JS puro, Supabase JS v2 (CDN), Jest (jsdom) para funções puras.

**Spec:** `docs/superpowers/specs/2026-06-11-logistica-design.md`

---

## ⚠️ Notas de execução (ler antes de começar)

1. **Git:** o projeto **não é** repositório git. Ignore qualquer passo de `commit` — não há git. Cada "ponto de salvamento" é só conceitual.
2. **Teste manual:** `python -m http.server 5500` na raiz e abrir `http://localhost:5500/index.html` (NUNCA `file://`). Recarregar com `Ctrl+Shift+R`. Admin de teste: `startbookings@gmail.com`.
3. **Convenções fixas:**
   - Tabela `public.logistics (id, event_key, event_date, artist, group_id, status, data, updated_at, created_by)`. `status ∈ {'andamento','concluida'}`. "Pendente" = ausência de linha.
   - `event_key` = `events.group_id` do evento.
   - Estado no app: `appState.logistics` = array `{ id, eventKey, eventDate, artist, groupId, status, data }`; `appState.logisticsEvents` = array `{ groupId, eventName, eventDate, venue, estado, artist }`.
   - localStorage: `sb_logistics`. `SB_DATA_VERSION = "4"`.
   - Papel exibido: string de role contém `(Logística)` (ex.: `"Maria (Logística)"`), análogo a `(Admin)`/`(Artista)`.

---

## Task 1: Migração do banco (`supabase_logistica_setup.sql`)

**Files:**
- Create: `supabase_logistica_setup.sql`

- [ ] **Step 1: Criar o arquivo SQL**

Create `supabase_logistica_setup.sql` com exatamente:
```sql
-- =====================================================================
--  StartBookings — Setup do módulo de Logística (Fase 1)
--  Requer que supabase_profiles_setup.sql já tenha rodado (is_admin etc.).
--  SQL Editor → New query → cole tudo → Run. Idempotente.
-- =====================================================================

-- 1) Papel 'Logistica' aceito em profiles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin','Artista','Logistica'));

-- 2) Mapa e-mail -> cargo logística (controlado pelo admin)
create table if not exists public.logistics_emails (
  email text primary key
);
alter table public.logistics_emails enable row level security;
drop policy if exists "logistics_emails_admin_all" on public.logistics_emails;
create policy "logistics_emails_admin_all" on public.logistics_emails
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- 3) is_logistics(): papel do próprio usuário lido de profiles
create or replace function public.is_logistics()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select p.role = 'Logistica' from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- 4) Trigger de signup: agora também marca 'Logistica' pelo mapa
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role   text := 'Artista';
  v_artist text;
begin
  if lower(coalesce(new.email,'')) in ('admin@startbookings.com','startbookings@gmail.com') then
    v_role := 'Admin';
  elsif exists (select 1 from public.logistics_emails le where lower(le.email) = lower(coalesce(new.email,''))) then
    v_role := 'Logistica';
  end if;

  select ae.artist_name into v_artist
  from public.artist_emails ae
  where lower(ae.email) = lower(coalesce(new.email,''));

  insert into public.profiles (id, email, role, artist_name)
  values (new.id, lower(coalesce(new.email,'')), v_role, v_artist)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- 5) Backfill: aplica 'Logistica' a quem já existe e está no mapa
update public.profiles p
  set role = 'Logistica'
  from public.logistics_emails le
  where lower(p.email) = lower(le.email) and p.role <> 'Admin';

-- 6) Função segura de eventos p/ logística (SEM financeiro)
create or replace function public.logistics_events()
returns table (group_id text, event_name text, event_date text, venue text, estado text, artist text)
language sql stable security definer set search_path = ''
as $$
  select e.group_id, e.event_name, e.event_date, e.venue, e.estado, e.artist
  from public.events e
  where public.is_admin() or public.is_logistics()
$$;

-- 7) Tabela logistics + RLS (Admin OU Logística)
create table if not exists public.logistics (
  id          text primary key,
  event_key   text not null,
  event_date  text,
  artist      text not null,
  group_id    text,
  status      text not null default 'andamento' check (status in ('andamento','concluida')),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
alter table public.logistics enable row level security;
drop policy if exists "logistics_all" on public.logistics;
create policy "logistics_all" on public.logistics
  for all to authenticated
  using ( (select public.is_admin()) or (select public.is_logistics()) )
  with check ( (select public.is_admin()) or (select public.is_logistics()) );

-- 8) >>> PREENCHA: e-mails que terão o cargo Logística <<<
--    Descomente e ajuste. Idempotente.
-- insert into public.logistics_emails (email) values ('produtor.logistica@exemplo.com')
--   on conflict (email) do nothing;

-- 9) Conferências
select policyname, cmd from pg_policies where schemaname='public' and tablename='logistics';
select id, email, role from public.profiles order by role;
```

- [ ] **Step 2: Rodar no Supabase e verificar**

SQL Editor → colar → Run. Expected: "Success". A conferência mostra a policy `logistics_all` e os profiles (admin como `Admin`).

- [ ] **Step 3: Verificar RLS de logistics (sem login → vazio)**

Run:
```bash
node -e 'const k="sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_";fetch("https://jijjacpgbnubamawbscw.supabase.co/rest/v1/logistics?select=*",{headers:{apikey:k,Authorization:"Bearer "+k}}).then(async r=>console.log(r.status,(await r.text()).slice(0,80)))'
```
Expected: `200 []`.

---

## Task 2: Funções puras de status e prazo (TDD)

**Files:**
- Modify: `app-v2.js` (perto de `getPaymentStatus`)
- Modify: `app-v2.js` (`module.exports`)
- Test: `__tests__/app.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Em `__tests__/app.test.js`, adicione dentro do `describe(...)` (antes do `});` final):
```javascript
  test('deriveLogisticsStatus() retorna pendente sem registro e o status quando há', () => {
    expect(app.deriveLogisticsStatus(null)).toBe('pendente');
    expect(app.deriveLogisticsStatus(undefined)).toBe('pendente');
    expect(app.deriveLogisticsStatus({ status: 'andamento' })).toBe('andamento');
    expect(app.deriveLogisticsStatus({ status: 'concluida' })).toBe('concluida');
  });

  test('daysUntil() calcula dias entre hoje e a data do evento', () => {
    expect(app.daysUntil('2026-06-18', '2026-06-11')).toBe(7);
    expect(app.daysUntil('2026-06-11', '2026-06-11')).toBe(0);
    expect(app.daysUntil('2026-06-10', '2026-06-11')).toBe(-1);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest -t "deriveLogisticsStatus|daysUntil"`
Expected: FAIL (funções não existem).

- [ ] **Step 3: Implementar**

Em `app-v2.js`, logo após a função `getPaymentStatus(...)`, adicione:
```javascript
// Status logístico de um artista: sem registro = 'pendente'.
function deriveLogisticsStatus(record) {
  if (!record) return 'pendente';
  return record.status || 'andamento';
}

// Dias entre uma data (YYYY-MM-DD) e "hoje" (YYYY-MM-DD). Negativo = passado.
function daysUntil(dateStr, todayStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date((todayStr || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}
```

- [ ] **Step 4: Exportar para teste**

No `module.exports = { ... }` no final de `app-v2.js`, adicione `deriveLogisticsStatus,` e `daysUntil,`:
```javascript
  module.exports = {
    formatCurrency,
    hexToRgba,
    getRandomColor,
    getPaymentStatus,
    deriveLogisticsStatus,
    daysUntil,
  };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest` → todos passam. Run: `node --check app-v2.js` → sem erro.

---

## Task 3: Estado de logística

**Files:**
- Modify: `app-v2.js` (init do estado e `saveState`)

- [ ] **Step 1: Bump da versão de limpeza**

Em `app-v2.js`, troque `const SB_DATA_VERSION = "3";` por:
```javascript
const SB_DATA_VERSION = "4";
```

- [ ] **Step 2: Adicionar arrays ao appState**

No objeto `let appState = { ... }`, logo após `clients: [],` adicione:
```javascript
  clients: [],
  logistics: [],
  logisticsEvents: [],
```

- [ ] **Step 3: Carregar do localStorage**

No bloco `try { ... } catch(err)` de leitura do localStorage, após `appState.clients = ...`, adicione:
```javascript
  appState.logistics = JSON.parse(localStorage.getItem("sb_logistics")) || [];
```

- [ ] **Step 4: Persistir no saveState**

Em `function saveState()`, junto dos outros `localStorage.setItem(...)`, adicione:
```javascript
  localStorage.setItem("sb_logistics", JSON.stringify(appState.logistics));
```

- [ ] **Step 5: Validar**

Run: `node --check app-v2.js` (sem erro) e `npx jest` (passa).

---

## Task 4: Carregar logística e eventos da logística no login

**Files:**
- Modify: `app-v2.js` (perto de `loadClientsFromSupabase` e nos handlers de login/getSession)

- [ ] **Step 1: Criar loaders**

Em `app-v2.js`, logo após a função `loadClientsFromSupabase()`, adicione:
```javascript
// Carrega as logísticas (Admin/Logística) para o appState.
async function loadLogisticsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.from('logistics').select('*');
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
    try { localStorage.setItem("sb_logistics", JSON.stringify(appState.logistics)); } catch (e) {}
  } catch (err) { console.error("loadLogisticsFromSupabase error:", err); }
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
```

- [ ] **Step 2: Chamar no getSession (DOMContentLoaded)**

No handler `DOMContentLoaded`, logo após `await loadClientsFromSupabase();`, adicione:
```javascript
        await loadLogisticsFromSupabase();
        await loadLogisticsEvents();
```

- [ ] **Step 3: Chamar no login por formulário**

No handler de submit do login, logo após `await loadClientsFromSupabase();`, adicione:
```javascript
        await loadLogisticsFromSupabase();
        await loadLogisticsEvents();
```

- [ ] **Step 4: Validar**

Run: `node --check app-v2.js` e `npx jest`.

---

## Task 5: Helpers de logística (buscar/salvar/desmembrar)

**Files:**
- Modify: `app-v2.js` (perto de `loadLogisticsEvents`)

- [ ] **Step 1: Adicionar helpers**

Em `app-v2.js`, após `loadLogisticsEvents()`, adicione:
```javascript
const LOGI_STATUS_LABELS = { pendente: "Logística Pendente", andamento: "Logística em Andamento", concluida: "Concluída" };

function getLogisticsRecord(eventKey, artist) {
  return appState.logistics.find(r => r.eventKey === eventKey && r.artist === artist) || null;
}

function getArtistLogisticsStatus(eventKey, artist) {
  return deriveLogisticsStatus(getLogisticsRecord(eventKey, artist));
}

// Cria/atualiza uma logística no estado e no Supabase.
function saveLogistics(record) {
  const idx = appState.logistics.findIndex(r => r.id === record.id);
  if (idx > -1) appState.logistics[idx] = record;
  else appState.logistics.push(record);
  try { localStorage.setItem("sb_logistics", JSON.stringify(appState.logistics)); } catch (e) {}
  if (sbClient && appState.currentRole) {
    sbClient.from('logistics').upsert({
      id: record.id, event_key: record.eventKey, event_date: record.eventDate,
      artist: record.artist, group_id: record.groupId, status: record.status, data: record.data
    }).then(({ error }) => { if (error) console.error("Supabase logistics sync error:", error); });
  }
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
```

- [ ] **Step 2: Validar**

Run: `node --check app-v2.js` (sem erro; `renderLogisticsDashboard` é definido na Task 8 e só é chamado em runtime).

---

## Task 6: Detecção do papel Logística + UI por papel

**Files:**
- Modify: `app-v2.js` (`applyRoleUIChanges`, e os dois pontos de detecção de role)
- Modify: `style.css` (ocultar tudo menos Logística)

- [ ] **Step 1: applyRoleUIChanges trata Logística**

Em `applyRoleUIChanges(role)`, logo no início (após `if (!role) return;`), adicione:
```javascript
  const isLogistics = role.includes("(Logística)");
  document.body.classList.toggle("role-logistica", isLogistics);
```

- [ ] **Step 2: Helper para detectar o papel via profiles**

Em `app-v2.js`, perto dos loaders, adicione:
```javascript
// Lê o papel do usuário logado na tabela profiles (fonte de verdade).
async function fetchProfileRole(userId) {
  if (!sbClient || !userId) return null;
  try {
    const { data, error } = await sbClient.from('profiles').select('role').eq('id', userId).single();
    if (error) return null;
    return data ? data.role : null;
  } catch (e) { return null; }
}
```

- [ ] **Step 3: Aplicar no login por formulário**

No handler do login, logo após calcular `roleFound` e ANTES de `appState.currentRole = roleFound;`, adicione:
```javascript
        const profRole = await fetchProfileRole(user.id);
        if (profRole === "Logistica") {
          roleFound = `${user.user_metadata?.name || "Logística"} (Logística)`;
        }
```

- [ ] **Step 4: Aplicar no getSession (DOMContentLoaded)**

No handler do getSession, logo após calcular `roleFound` e antes de `appState.currentRole = roleFound;`, adicione:
```javascript
        const profRole = await fetchProfileRole(user.id);
        if (profRole === "Logistica") {
          roleFound = `${user.user_metadata?.name || "Logística"} (Logística)`;
        }
```

- [ ] **Step 5: CSS — esconder tudo menos Logística**

Em `style.css`, ao final, adicione:
```css
/* Cargo Logística: vê apenas a aba Logística */
body.role-logistica .menu-item[data-view="dashboard"],
body.role-logistica .menu-item[data-view="clients"],
body.role-logistica .menu-item[data-view="table"],
body.role-logistica .menu-item[data-view="timeline"],
body.role-logistica .menu-item[data-view="kanban"],
body.role-logistica .menu-item[data-view="settings"],
body.role-logistica .stat-badge-header {
  display: none !important;
}
```

- [ ] **Step 6: Validar**

Run: `node --check app-v2.js` e `npx jest`.

---

## Task 7: HTML — menu, seção, modais de criação e de formulário

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Item de menu "Logística"**

Na `<ul class="sidebar-menu">`, ANTES do `<li>` com `data-view="settings"`, insira:
```html
        <li id="nav-logistica-item">
          <a class="menu-item" role="button" tabindex="0" data-view="logistics">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
            Logística
          </a>
        </li>
```

- [ ] **Step 2: Seção `#logistics-view`**

Dentro de `<main class="content-body">`, ANTES de `<section id="settings-view" ...>`, insira:
```html
      <!-- LOGISTICS VIEW -->
      <section id="logistics-view" class="view-section">
        <div id="logistics-deadline-alert"></div>
        <div class="kpi-grid" id="logistics-kpis"></div>
        <div class="filter-bar" style="margin-top: 24px;">
          <div class="filters-group"><h3 class="chart-title">Logísticas</h3></div>
          <button class="btn-primary" id="open-new-logistics-btn">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Criar nova logística
          </button>
        </div>
        <div id="logistics-list" class="events-list-container"></div>
      </section>
```

- [ ] **Step 3: Modal de criação (cascata)**

Junto dos outros modais (antes de `<!-- TOAST NOTIFICATION CONTAINER -->`), insira:
```html
  <!-- LOGISTICS CREATE (cascade) MODAL -->
  <div class="modal-overlay" id="logistics-create-modal">
    <div class="modal-content" style="max-width: 520px;">
      <div class="modal-header">
        <h3 class="modal-title">Criar nova logística</h3>
        <button class="modal-close" id="close-logistics-create-btn" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="logistics-event-select">Evento</label>
          <select id="logistics-event-select" class="form-control">
            <option value="" disabled selected>Selecione o evento</option>
          </select>
        </div>
        <div class="form-group">
          <label>Artistas (mesma rota)</label>
          <div id="logistics-artists-container" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="cancel-logistics-create-btn">Cancelar</button>
        <button type="button" class="btn-primary" id="logistics-create-next-btn">Continuar</button>
      </div>
    </div>
  </div>

  <!-- LOGISTICS FORM MODAL -->
  <div class="modal-overlay" id="logistics-form-modal">
    <div class="modal-content" style="max-width: 720px;">
      <div class="modal-header">
        <h3 class="modal-title" id="logistics-form-title">Logística</h3>
        <button class="modal-close" id="close-logistics-form-btn" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body" id="logistics-form-body"></div>
      <div class="modal-footer" style="justify-content: space-between;">
        <span id="logistics-form-artists" style="font-size:12px; color:var(--text-muted);"></span>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn-secondary" id="logistics-save-draft-btn">Salvar Rascunho</button>
          <button type="button" class="btn-primary" id="logistics-finalize-btn">Finalizar Logística</button>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: Validar (Read)**

Confirme via Read que `#logistics-view`, `#logistics-create-modal`, `#logistics-form-modal` e `#nav-logistica-item` existem.

---

## Task 8: Dashboard de Logística (KPIs + alerta + lista) e registro da view

**Files:**
- Modify: `app-v2.js` (`initNavigation` titles/subtitles + switchView; `renderLogisticsDashboard`)

- [ ] **Step 1: Registrar título/subtítulo e refresh**

Em `initNavigation`, adicione no objeto `titles`: `logistics: "Logística",` e no `subtitles`:
```javascript
    logistics: "Roteiros de viagem dos artistas: status, prazos e itinerários.",
```
Em `switchView`, adicione um ramo:
```javascript
    } else if (targetView === "logistics") {
      renderLogisticsDashboard();
```

- [ ] **Step 2: Implementar `renderLogisticsDashboard`**

Em `app-v2.js`, adicione:
```javascript
function logisticsToday() { return new Date().toISOString().slice(0, 10); }

// Monta a lista de (evento, artista) escalados a partir dos eventos da logística.
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

  // Alerta de prazo crítico (<= 7 dias com pendente/andamento)
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

  // Lista agrupada por evento
  const groups = {};
  rows.forEach(r => {
    if (!groups[r.eventKey]) groups[r.eventKey] = { eventName: r.eventName, eventDate: r.eventDate, items: [] };
    groups[r.eventKey].items.push(r);
  });
  const keys = Object.keys(groups).sort((a, b) => new Date(groups[a].eventDate) - new Date(groups[b].eventDate));
  list.innerHTML = keys.length === 0
    ? `<div style="text-align:center; color:var(--text-muted); padding:30px; border:1px solid var(--border-color); border-radius:8px;">Nenhum artista escalado encontrado.</div>`
    : keys.map(k => {
        const g = groups[k];
        const itemsHtml = g.items.map(it => {
          const rec = getLogisticsRecord(it.eventKey, it.artist);
          const st = deriveLogisticsStatus(rec);
          const actions = st === 'pendente'
            ? `<button class="btn-secondary logi-fill-btn" data-key="${escapeHtml(it.eventKey)}" data-artist="${escapeHtml(it.artist)}">Preencher</button>`
            : `<button class="btn-secondary logi-edit-btn" data-id="${escapeHtml(rec.id)}">Editar</button>
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

  // Ações
  list.querySelectorAll(".logi-fill-btn").forEach(b => b.addEventListener("click", () => {
    openLogisticsForm({ eventKey: b.getAttribute("data-key"), artists: [b.getAttribute("data-artist")] });
  }));
  list.querySelectorAll(".logi-edit-btn").forEach(b => b.addEventListener("click", () => {
    const rec = appState.logistics.find(r => r.id === b.getAttribute("data-id"));
    if (rec) openLogisticsForm({ existing: rec });
  }));
  list.querySelectorAll(".logi-split-btn").forEach(b => b.addEventListener("click", () => splitLogistics(b.getAttribute("data-id"))));
}
```

- [ ] **Step 3: Renderizar após carregar dados**

Nos dois pontos pós-login (após `renderClientsView();`), adicione:
```javascript
        renderLogisticsDashboard();
```

- [ ] **Step 4: Validar**

Run: `node --check app-v2.js` e `npx jest`. (As funções `openLogisticsForm`/`initLogisticsModule` vêm nas Tasks 9–10.)

---

## Task 9: Fluxo de criação em cascata + wiring do módulo

**Files:**
- Modify: `app-v2.js` (`initLogisticsModule`, chamado no DOMContentLoaded)

- [ ] **Step 1: Implementar `initLogisticsModule` + cascata**

Em `app-v2.js`, adicione:
```javascript
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
}
```

- [ ] **Step 2: Chamar no DOMContentLoaded**

No primeiro `DOMContentLoaded`, junto das outras `init*()`, adicione:
```javascript
  initLogisticsModule();
```

- [ ] **Step 3: Validar**

Run: `node --check app-v2.js` e `npx jest`. (`openLogisticsForm` vem na Task 10.)

---

## Task 10: Formulário (estadia + ida/volta + modos + conexões) e salvar

**Files:**
- Modify: `app-v2.js` (`openLogisticsForm`, render de trechos, coleta e save)

- [ ] **Step 1: Implementar render do formulário e coleta**

Em `app-v2.js`, adicione:
```javascript
const LEG_MODES = [["carro", "Carro / BlaBlaCar"], ["uber", "Uber / Táxi"], ["aviao", "Avião"]];

function logiInput(id, label, value) {
  return `<div class="form-group"><label for="${id}">${label}</label>
    <input type="text" id="${id}" class="form-control" value="${escapeHtml(value || "")}"></div>`;
}

function renderLegFields(prefix, modo, data) {
  const d = data || {};
  if (modo === "carro") {
    return logiInput(`${prefix}-saida`, "Saída", d.saida) + logiInput(`${prefix}-chegada`, "Chegada prevista", d.chegada) +
      logiInput(`${prefix}-pontoEncontro`, "Ponto de encontro", d.pontoEncontro) +
      logiInput(`${prefix}-motoristaNome`, "Motorista (nome)", d.motoristaNome) +
      logiInput(`${prefix}-carroModelo`, "Modelo do carro", d.carroModelo) + logiInput(`${prefix}-placa`, "Placa", d.placa);
  }
  if (modo === "uber") {
    return logiInput(`${prefix}-saida`, "Saída", d.saida) + logiInput(`${prefix}-chegada`, "Chegada prevista", d.chegada) +
      logiInput(`${prefix}-origem`, "Origem", d.origem) + logiInput(`${prefix}-destino`, "Destino", d.destino);
  }
  // aviao
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
    ${logiInput(`${prefix}-conn-${i}-hotelNome`, "Hotel da escala", c.hotelNome)}
    ${logiInput(`${prefix}-conn-${i}-hotelEndereco`, "Endereço do hotel", c.hotelEndereco)}
    ${logiInput(`${prefix}-conn-${i}-translado`, "Translado local", c.translado)}
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
  body.innerHTML = `
    <h4 style="margin:4px 0 10px;">Hospedagem principal</h4>
    ${logiInput("log-hotel-nome", "Hotel / acomodação", h.nome)}
    ${logiInput("log-hotel-endereco", "Endereço", h.endereco)}
    <div class="form-row-2">${logiInput("log-hotel-checkin", "Check-in (data + hora)", h.checkin)}${logiInput("log-hotel-checkout", "Check-out (data + hora)", h.checkout)}</div>
    ${legSectionHTML("log-ida", "Ida", data.ida)}
    ${legSectionHTML("log-volta", "Volta", data.volta)}`;

  // Trocar modo re-renderiza os campos do trecho
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
  const v = (suffix) => { const el = document.getElementById(`${prefix}-${suffix}`); return el ? el.value.trim() : ""; };
  if (modo === "carro") return { modo, saida: v("saida"), chegada: v("chegada"), pontoEncontro: v("pontoEncontro"), motoristaNome: v("motoristaNome"), carroModelo: v("carroModelo"), placa: v("placa") };
  if (modo === "uber") return { modo, saida: v("saida"), chegada: v("chegada"), origem: v("origem"), destino: v("destino") };
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
  return {
    hotel: { nome: g("log-hotel-nome"), endereco: g("log-hotel-endereco"), checkin: g("log-hotel-checkin"), checkout: g("log-hotel-checkout") },
    ida: collectLeg("log-ida"),
    volta: collectLeg("log-volta")
  };
}
```

- [ ] **Step 2: Botões Salvar Rascunho / Finalizar**

Ainda em `app-v2.js`, dentro de `initLogisticsModule` (no final da função, antes do `}` que a fecha), adicione:
```javascript
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
```

- [ ] **Step 3: Validar**

Run: `node --check app-v2.js` e `npx jest`.

- [ ] **Step 4: Teste manual (admin)**

Servidor local + login admin → aba Logística → "Criar nova logística" → escolher evento ativo → marcar artistas → preencher hospedagem + Ida (testar trocar modo p/ Avião e adicionar conexão) + Volta → "Salvar Rascunho" (vira Em Andamento) e depois "Finalizar" (vira Concluída). Conferir os KPIs mudando.

---

## Task 11: Indicadores de status na Tabela de Eventos

**Files:**
- Modify: `app-v2.js` (`renderEventTable` — célula por artista)

- [ ] **Step 1: Adicionar o cabeçalho da coluna LOGÍSTICA**

Em `renderEventTable`, no template do `<thead>` do grupo, localize a linha:
```javascript
                <th>OBS.</th>
                ${isArtist ? '' : '<th class="actions-header-column" style="width: 80px; text-align: center;">AÇÕES</th>'}
```
Substitua por (inserindo a coluna LOGÍSTICA entre OBS e AÇÕES, só para admin):
```javascript
                <th>OBS.</th>
                ${isArtist ? '' : '<th style="width: 150px;">LOGÍSTICA</th>'}
                ${isArtist ? '' : '<th class="actions-header-column" style="width: 80px; text-align: center;">AÇÕES</th>'}
```

- [ ] **Step 2: Mostrar status logístico na linha do artista (admin)**

Ainda em `renderEventTable`, no ramo `else` (não-artista) onde se monta `row.innerHTML`, localize a célula de OBS (a que tem `data-field="financeNotes"`). LOGO APÓS o `</td>` dessa célula de OBS, e ANTES da célula de ações (a `<td>` com `.delete-btn`), insira:
```javascript
          <td style="font-size:11px; white-space:nowrap;">
            ${(() => {
              const st = getArtistLogisticsStatus(e.groupId || "", e.artist);
              if (st === 'concluida') return `<button class="btn-secondary logi-view-btn" data-key="${escapeHtml(e.groupId || '')}" data-artist="${escapeHtml(e.artist || '')}" style="padding:4px 10px; font-size:11px;">Ver Logística</button>`;
              const color = st === 'andamento' ? '#ff9f0a' : 'var(--text-muted)';
              return `<span style="color:${color};">${LOGI_STATUS_LABELS[st]}</span>`;
            })()}
          </td>
```
> Nota: o `e.groupId` do evento é o `event_key` da logística. O botão "Ver Logística" (status concluída) terá a ação (modal) ligada na **Fase 2**; nesta fase ele apenas aparece.

- [ ] **Step 3: Validar**

Run: `node --check app-v2.js` e `npx jest`.

- [ ] **Step 4: Teste manual**

Na Tabela de Eventos, um artista sem logística mostra "Logística Pendente"; com rascunho, "Logística em Andamento" (amarelo); finalizada, botão "Ver Logística".

---

## Task 12: CSS (dashboard, alerta, linhas, formulário) + bump de versão

**Files:**
- Modify: `style.css`
- Modify: `index.html` (versões de script e css)

- [ ] **Step 1: Estilos**

Em `style.css`, ao final, adicione:
```css
/* ===== Logística ===== */
.deadline-alert {
  background: rgba(255, 69, 58, 0.12);
  border: 1px solid rgba(255, 69, 58, 0.5);
  color: #ff6b61;
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 20px;
  font-size: 13px;
  font-weight: 600;
  animation: deadlinePulse 1.2s ease-in-out infinite;
}
@keyframes deadlinePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 69, 58, 0.0); }
  50% { box-shadow: 0 0 14px 2px rgba(255, 69, 58, 0.35); }
}
@media (prefers-reduced-motion: reduce) { .deadline-alert { animation: none; } }

.logi-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 18px; border-top: 1px solid var(--border-color);
}
.logi-row > span:first-child { font-weight: 600; min-width: 140px; }
.logi-row-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
```

- [ ] **Step 2: Bump das versões**

Em `index.html`: incremente o número de `app-v2.js?v=N` (N→N+1) e de `style.css?v=M` (M→M+1). Use Read para descobrir os números atuais e reporte os antigos/novos.

- [ ] **Step 3: Validar**

Run: `node --check app-v2.js` e `npx jest`.

---

## Task 13: Verificação final da Fase 1

**Files:** nenhum (QA).

- [ ] **Step 1: Sintaxe e testes**

Run: `node --check app-v2.js && npx jest`
Expected: sem erro de sintaxe; todos os testes passam (inclui `deriveLogisticsStatus`/`daysUntil`).

- [ ] **Step 2: RLS sem login**

Run:
```bash
node -e 'const k="sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_";fetch("https://jijjacpgbnubamawbscw.supabase.co/rest/v1/logistics?select=*",{headers:{apikey:k,Authorization:"Bearer "+k}}).then(async r=>console.log(r.status,(await r.text()).slice(0,40)))'
```
Expected: `200 []`.

- [ ] **Step 3: Roteiro manual (admin)**

Login admin: aba Logística aparece; criar/preencher/rascunho/finalizar; KPIs e alerta de prazo corretos; desmembrar isola o artista; status aparece na Tabela de Eventos.

- [ ] **Step 4: Roteiro manual (logística)** *(se houver um e-mail no mapa)*

Adicione um e-mail em `logistics_emails` (passo 8 do SQL), cadastre/login com ele: deve ver **apenas** a aba Logística; sem Tabela de Eventos, Clientes, etc.

---

## Mapa de arquivos (referência)

| Arquivo | Responsabilidade |
|---|---|
| `supabase_logistica_setup.sql` | Papel Logistica, logistics_emails, is_logistics(), logistics_events(), tabela logistics + RLS |
| `index.html` | Menu Logística, `#logistics-view`, modais de criação e de formulário, bump de versões |
| `app-v2.js` | Estado, loaders, helpers, dashboard, cascata, formulário, save/desmembrar, status na tabela, funções puras |
| `style.css` | Dashboard/alerta/linhas/formulário, ocultação por `role-logistica` |
| `__tests__/app.test.js` | Testes de `deriveLogisticsStatus` e `daysUntil` |
