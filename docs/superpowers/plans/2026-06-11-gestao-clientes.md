# Módulo de Gestão de Clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um módulo de Clientes (contratantes/promotores) que é o "pai" hierárquico dos eventos, com painel/histórico por cliente, criação rápida no modal de evento e status de contrato/pagamento.

**Architecture:** SPA vanilla JS (`app-v2.js`) + Supabase. Nova tabela `clients` com RLS (reusa `is_admin()`), coluna `client_id` + `contract_status` em `events`. Estado espelhado em `appState.clients` + localStorage, carregado do banco no login. Tela "Clientes" em acordeão reusando os estilos `event-group`. Pagamento é derivado de `amount`/`amountReceived` (sem coluna nova).

**Tech Stack:** HTML/CSS/JS puro, Supabase JS v2 (CDN), Jest (jsdom) para funções puras.

**Spec:** `docs/superpowers/specs/2026-06-11-gestao-clientes-design.md`

---

## ⚠️ Notas de execução (ler antes de começar)

1. **Git:** o projeto **não é** um repositório git hoje. Os passos de `commit` abaixo são **opcionais**. Se quiser versionar, rode `git init` antes (Task 0). Caso contrário, trate cada "Commit" como um ponto de salvamento e pule o comando.
2. **Servidor local para teste manual:** rode `python -m http.server 5500` na raiz do projeto e abra `http://localhost:5500/index.html`. Use `Ctrl+Shift+R` para recarregar sem cache. NÃO teste via `file://` (quebra CORS do Supabase).
3. **Admin de teste:** logar com `startbookings@gmail.com` (é admin). O módulo Clientes é admin-only.
4. **Convenções de nomes (fixas no plano):**
   - Tabela `public.clients` (colunas `id`, `name`, `contact`, `created_at`, `created_by`).
   - `events.client_id` (text), `events.contract_status` (text: `pendente`|`enviado`|`assinado`).
   - Estado: `appState.clients` = array de `{ id, name, contact }`; localStorage key `sb_clients`.
   - `SB_DATA_VERSION = "3"`.
   - Status de pagamento (derivado): `'pendente'` | `'sinal_pago'` | `'pago_total'`.

---

## Task 0 (opcional): Inicializar git

**Files:** nenhum (só repo).

- [ ] **Step 1: Inicializar repositório (se desejar versionar)**

Run:
```bash
git init
git add -A
git commit -m "chore: snapshot antes do modulo de clientes"
```
Expected: repositório criado. Se você não quer git, pule esta task inteira e ignore os passos "Commit" das próximas tasks.

---

## Task 1: Migração do banco (`supabase_clients_setup.sql`)

**Files:**
- Create: `supabase_clients_setup.sql`

- [ ] **Step 1: Criar o arquivo SQL**

Create `supabase_clients_setup.sql` com exatamente:
```sql
-- =====================================================================
--  StartBookings — Setup do módulo de Clientes
--  SQL Editor → New query → cole tudo → Run. Idempotente.
-- =====================================================================

-- 1) Tabela de clientes
create table if not exists public.clients (
  id text primary key,
  name text not null,
  contact text default '',
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);

-- 2) Colunas novas em events
alter table public.events add column if not exists client_id text;
alter table public.events add column if not exists contract_status text default 'pendente';

-- 3) RLS da tabela clients (somente admin)
alter table public.clients enable row level security;

drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;
drop policy if exists "clients_delete" on public.clients;

create policy "clients_select" on public.clients
  for select to authenticated using ( public.is_admin() );
create policy "clients_insert" on public.clients
  for insert to authenticated with check ( public.is_admin() );
create policy "clients_update" on public.clients
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy "clients_delete" on public.clients
  for delete to authenticated using ( public.is_admin() );

-- 4) Cliente padrão "A definir" + vínculo dos eventos antigos
insert into public.clients (id, name, contact)
values ('cli-a-definir', 'A definir', '')
on conflict (id) do nothing;

update public.events set client_id = 'cli-a-definir' where client_id is null;

-- 5) Conferência
select c.id, c.name, count(e.id) as eventos
from public.clients c
left join public.events e on e.client_id = c.id
group by c.id, c.name
order by c.name;
```

- [ ] **Step 2: Rodar no Supabase e verificar**

Abrir Supabase → SQL Editor → colar → Run.
Expected: "Success". A query de conferência mostra `A definir` com a contagem de eventos atuais. Anote esse número.

- [ ] **Step 3: Verificar RLS (sem login retorna vazio)**

Run (no terminal local):
```bash
node -e 'const k="sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_";fetch("https://jijjacpgbnubamawbscw.supabase.co/rest/v1/clients?select=*",{headers:{apikey:k,Authorization:"Bearer "+k}}).then(async r=>console.log(r.status,(await r.text()).slice(0,100)))'
```
Expected: `200 []` (RLS bloqueia anônimo).

- [ ] **Step 4: Commit (opcional)**
```bash
git add supabase_clients_setup.sql
git commit -m "feat(db): tabela clients, colunas em events e RLS"
```

---

## Task 2: Função pura `getPaymentStatus` (TDD)

**Files:**
- Modify: `app-v2.js` (seção UTILITIES, perto de `formatCurrency`)
- Modify: `app-v2.js` (bloco `module.exports` no final)
- Test: `__tests__/app.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Em `__tests__/app.test.js`, adicione dentro do `describe(...)` (antes do `});` final):
```javascript
  test('getPaymentStatus() deriva o status de pagamento por artista', () => {
    expect(app.getPaymentStatus(1000, 0)).toBe('pendente');
    expect(app.getPaymentStatus(1000, 400)).toBe('sinal_pago');
    expect(app.getPaymentStatus(1000, 1000)).toBe('pago_total');
    expect(app.getPaymentStatus(1000, 1500)).toBe('pago_total');
    expect(app.getPaymentStatus(0, 0)).toBe('pendente');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest -t getPaymentStatus`
Expected: FAIL — `app.getPaymentStatus is not a function`.

- [ ] **Step 3: Implementar a função**

Em `app-v2.js`, logo após a função `formatCurrency(...)`, adicione:
```javascript
// Deriva o status de pagamento de um artista a partir do valor e do recebido.
function getPaymentStatus(amount, received) {
  const total = parseFloat(amount) || 0;
  const paid = parseFloat(received) || 0;
  if (paid <= 0) return 'pendente';
  if (total > 0 && paid >= total) return 'pago_total';
  return 'sinal_pago';
}
```

- [ ] **Step 4: Exportar para o teste**

No final de `app-v2.js`, dentro de `module.exports = { ... }`, adicione `getPaymentStatus,`:
```javascript
  module.exports = {
    formatCurrency,
    hexToRgba,
    getRandomColor,
    getPaymentStatus,
  };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx jest -t getPaymentStatus`
Expected: PASS.

- [ ] **Step 6: Commit (opcional)**
```bash
git add app-v2.js __tests__/app.test.js
git commit -m "feat: getPaymentStatus (derivacao do cachet)"
```

---

## Task 3: Estado de clientes + limpeza de versão

**Files:**
- Modify: `app-v2.js` (bloco de inicialização do estado, topo do arquivo)

- [ ] **Step 1: Bump da versão de limpeza**

Em `app-v2.js`, localize `const SB_DATA_VERSION = "2";` e troque para:
```javascript
const SB_DATA_VERSION = "3";
```
(Isso já existe do trabalho anterior; só muda o número. NÃO adicione `sb_clients` à lista de remoção — clientes vêm do banco, mas não queremos apagar cache à toa.)

- [ ] **Step 2: Adicionar `clients` ao appState (default vazio)**

No objeto `let appState = { ... }`, adicione a propriedade `clients: [],` logo após `events: DEFAULT_EVENTS,`:
```javascript
  events: DEFAULT_EVENTS,
  clients: [],
```

- [ ] **Step 3: Carregar clientes do localStorage**

No bloco `try { ... } catch(err)` que lê o localStorage, adicione após a linha de `appState.events = ...`:
```javascript
  appState.clients = JSON.parse(localStorage.getItem("sb_clients")) || [];
```

- [ ] **Step 4: Persistir clientes no saveState**

Em `function saveState()`, junto dos outros `localStorage.setItem(...)`, adicione:
```javascript
  localStorage.setItem("sb_clients", JSON.stringify(appState.clients));
```

- [ ] **Step 5: Verificação manual**

Abra o app no navegador, abra o Console (F12) e digite `appState.clients`.
Expected: `[]` (ou os clientes em cache). Sem erros no console.

- [ ] **Step 6: Commit (opcional)**
```bash
git add app-v2.js
git commit -m "feat: estado de clientes no appState"
```

---

## Task 4: Carregar clientes do Supabase no login

**Files:**
- Modify: `app-v2.js` (perto de `loadEventsFromSupabase`, e nas chamadas de login/getSession)

- [ ] **Step 1: Criar `loadClientsFromSupabase`**

Em `app-v2.js`, logo após a função `loadEventsFromSupabase()`, adicione:
```javascript
// Carrega os clientes do Supabase para o appState (fonte de verdade = banco).
async function loadClientsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.from('clients').select('*');
    if (error) { console.error("Supabase clients fetch error:", error); return; }
    appState.clients = (data || []).map(c => ({
      id: c.id,
      name: c.name || "",
      contact: c.contact || ""
    }));
    try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) {}
  } catch (err) {
    console.error("loadClientsFromSupabase error:", err);
  }
}
```

- [ ] **Step 2: Chamar no getSession inicial (DOMContentLoaded)**

Em `app-v2.js`, no handler `DOMContentLoaded`, logo após `await loadEventsFromSupabase();`, adicione:
```javascript
        await loadClientsFromSupabase();
```

- [ ] **Step 3: Chamar no login por formulário**

No handler de submit do `loginForm`, logo após `await loadEventsFromSupabase();`, adicione:
```javascript
        await loadClientsFromSupabase();
```

- [ ] **Step 4: Verificação manual**

Recarregue (`Ctrl+Shift+R`), faça login com `startbookings@gmail.com`, e no Console digite `appState.clients`.
Expected: array com `{ id: 'cli-a-definir', name: 'A definir', contact: '' }`.

- [ ] **Step 5: Commit (opcional)**
```bash
git add app-v2.js
git commit -m "feat: carregar clientes do Supabase no login"
```

---

## Task 5: saveClient / deleteClient / helpers

**Files:**
- Modify: `app-v2.js` (perto de loadClientsFromSupabase)

- [ ] **Step 1: Helpers de clientes**

Em `app-v2.js`, após `loadClientsFromSupabase()`, adicione:
```javascript
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
  try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) {}
  if (sbClient && appState.currentRole) {
    sbClient.from('clients').upsert({ id: client.id, name: client.name, contact: client.contact || "" })
      .then(({ error }) => { if (error) console.error("Supabase client sync error:", error); });
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
    try { localStorage.setItem("sb_clients", JSON.stringify(appState.clients)); } catch (e) {}
    if (sbClient && appState.currentRole) {
      sbClient.from('clients').delete().eq('id', clientId)
        .then(({ error }) => { if (error) console.error("Supabase client delete error:", error); });
    }
    renderClientsView();
    showToast("Cliente excluído.");
  });
}
```

> Nota de mapeamento: o `appState.events` usa `clientId` (camelCase) no front; o banco usa `client_id`. O mapeamento é feito em `loadEventsFromSupabase` (Task 8) e `saveState` (Task 8).

- [ ] **Step 2: Verificação de sintaxe**

Run: `node --check app-v2.js`
Expected: sem saída de erro (sintaxe OK). `renderClientsView` ainda não existe — será criado na Task 7; não é chamado até lá.

- [ ] **Step 3: Commit (opcional)**
```bash
git add app-v2.js
git commit -m "feat: saveClient/deleteClient/getClientName"
```

---

## Task 6: HTML — menu, seção Clientes, modal "Novo Cliente", CSS de visibilidade

**Files:**
- Modify: `index.html` (sidebar menu, content-body, modais)
- Modify: `style.css` (ocultar para artista)

- [ ] **Step 1: Item de menu "Clientes" (acima de Tabela de Eventos)**

Em `index.html`, na `<ul class="sidebar-menu">`, ANTES do `<li>` com `data-view="table"`, insira:
```html
        <li id="nav-clientes-item">
          <a class="menu-item" role="button" tabindex="0" data-view="clients">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Clientes
          </a>
        </li>
```

- [ ] **Step 2: Seção `#clients-view`**

Em `index.html`, dentro de `<main class="content-body">`, ANTES de `<section id="table-view" ...>`, insira:
```html
      <!-- CLIENTS VIEW -->
      <section id="clients-view" class="view-section">
        <div class="filter-bar">
          <div class="filters-group">
            <div class="search-box-container">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="client-search" class="search-input" placeholder="Buscar cliente...">
            </div>
          </div>
          <button class="btn-primary" id="open-new-client-btn">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Novo Cliente
          </button>
        </div>
        <div id="clients-list-container" class="events-list-container"></div>
      </section>
```

- [ ] **Step 3: Modal "Novo/Editar Cliente"**

Em `index.html`, junto dos outros modais (antes de `<!-- TOAST NOTIFICATION CONTAINER -->`), insira:
```html
  <!-- NEW/EDIT CLIENT MODAL -->
  <div class="modal-overlay" id="client-modal" style="z-index: 10000; align-items: center; justify-content: center;">
    <div class="modal-content" style="max-width: 440px;">
      <div class="modal-header">
        <h3 class="modal-title" id="client-modal-title">Novo Cliente</h3>
        <button class="modal-close" id="close-client-modal-btn" aria-label="Fechar">&times;</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <input type="hidden" id="client-id-input">
        <div class="form-group">
          <label for="client-name-input">Nome do Cliente / Promotor *</label>
          <input type="text" id="client-name-input" class="form-control" placeholder="Ex: Produtora XYZ" required>
        </div>
        <div class="form-group">
          <label for="client-contact-input">Contato do Produtor (WhatsApp, telefone ou e-mail)</label>
          <input type="text" id="client-contact-input" class="form-control" placeholder="Ex: (11) 99999-9999">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="cancel-client-modal-btn">Cancelar</button>
        <button type="button" class="btn-primary" id="save-client-btn">Salvar</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: Ocultar módulo para artista (CSS)**

Em `style.css`, localize a regra `body.role-artist #admin-artists-card, body.role-artist #admin-sellers-card, body.role-artist #nav-kanban-item { display: none !important; }` e adicione `#nav-clientes-item`:
```css
body.role-artist #admin-artists-card,
body.role-artist #admin-sellers-card,
body.role-artist #nav-kanban-item,
body.role-artist #nav-clientes-item {
  display: none !important;
}
```

- [ ] **Step 5: Verificação manual**

Recarregue. O menu deve mostrar "Clientes" acima de "Tabela de Eventos". Clicar nele mostra a seção vazia com a barra de busca e o botão "Novo Cliente". (A renderização da lista vem na Task 7.)
Expected: navegação funciona; sem erros no console (o título/subtítulo podem ficar genéricos até a Task 7 registrar a view).

- [ ] **Step 6: Commit (opcional)**
```bash
git add index.html style.css
git commit -m "feat(ui): menu Clientes, secao e modal de cliente"
```

---

## Task 7: Registrar a view e renderizar o acordeão de Clientes

**Files:**
- Modify: `app-v2.js` (initNavigation titles/subtitles + switchView; nova `renderClientsView`; init do modal de cliente; chamar render no load)

- [ ] **Step 1: Registrar título/subtítulo e refresh da view**

Em `initNavigation`, no objeto `subtitles`, adicione a linha `clients`:
```javascript
    clients: "Catálogo de clientes/promotores e o histórico de produções de cada um.",
```
No objeto `titles`, adicione:
```javascript
    clients: "Clientes",
```
Em `switchView`, no encadeamento `if (targetView === ...)`, adicione um ramo:
```javascript
    } else if (targetView === "clients") {
      renderClientsView();
```

- [ ] **Step 2: Implementar `renderClientsView`**

Em `app-v2.js`, adicione a função (perto de `renderEventTable`):
```javascript
const CONTRACT_LABELS = { pendente: "Pendente", enviado: "Enviado", assinado: "Assinado" };
const PAYMENT_LABELS = { pendente: "Pendente", sinal_pago: "Sinal Pago", pago_total: "Totalmente Pago" };

function renderClientsView() {
  const container = document.getElementById("clients-list-container");
  if (!container) return;
  container.innerHTML = "";

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

    // Eventos do cliente, agrupados por evento (nome|data|local|estado)
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
        const paidCount = g.items.filter(i => getPaymentStatus(i.amount, i.amountReceived) === 'pago_total').length;
        const contract = g.contract;
        return `
          <div class="client-history-item">
            <div class="client-history-main">
              <strong>${escapeHtml(g.event || "—")}</strong>
              <span class="client-history-date">${formatDate(g.date)}</span>
            </div>
            <div class="client-history-lineup"><span>Line-up:</span> ${lineup || "—"}</div>
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
          <button class="action-icon-btn edit-client-btn" data-id="${safeId}" title="Editar Cliente" aria-label="Editar cliente ${safeName}">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button class="action-icon-btn delete-client-btn" data-id="${safeId}" title="Excluir Cliente" aria-label="Excluir cliente ${safeName}">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
      <div class="event-table-container${isCollapsed ? ' collapsed' : ''}" data-client="${safeId}">
        ${historyHtml}
      </div>`;
    container.appendChild(card);
  });

  // Toggle expandir/colapsar
  container.querySelectorAll(".event-group-header").forEach(header => {
    header.addEventListener("click", (e) => {
      if (e.target.closest(".action-icon-btn")) return;
      const id = header.getAttribute("data-client");
      if (window.collapsedClients.has(id)) window.collapsedClients.delete(id);
      else window.collapsedClients.add(id);
      renderClientsView();
    });
  });
  // Editar
  container.querySelectorAll(".edit-client-btn").forEach(btn => {
    btn.addEventListener("click", () => openClientModal(btn.getAttribute("data-id")));
  });
  // Excluir
  container.querySelectorAll(".delete-client-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteClient(btn.getAttribute("data-id")));
  });
}
```

- [ ] **Step 3: Init do modal de cliente (`openClientModal` + handlers)**

Em `app-v2.js`, adicione a função e o init:
```javascript
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
```

- [ ] **Step 4: Chamar o init no DOMContentLoaded**

No primeiro `document.addEventListener("DOMContentLoaded", ...)`, junto das outras chamadas `init*()`, adicione:
```javascript
  initClientModule();
```

- [ ] **Step 5: Renderizar após login/getSession**

Em `app-v2.js`, nos dois pontos onde já se chama `updateConfigLists();` após carregar dados (login por form e getSession), adicione logo depois:
```javascript
        renderClientsView();
```

- [ ] **Step 6: Verificação manual**

Recarregue, faça login, vá em "Clientes". Deve aparecer o card "A definir". Crie um cliente novo pelo botão; ele aparece na lista. Edite e exclua um cliente sem eventos.
Expected: o CRUD de clientes funciona; sem erros no console.
> Atenção: a **contagem de eventos e o histórico** de cada cliente só aparecem completos **após a Task 8** (que mapeia `client_id` para `appState.events`). Até lá, os cards mostram "0 eventos" — é esperado nesta etapa.

- [ ] **Step 7: Commit (opcional)**
```bash
git add app-v2.js
git commit -m "feat(ui): tela de Clientes em acordeao com historico"
```

---

## Task 8: Mapear client_id/contract_status em load e save de eventos

**Files:**
- Modify: `app-v2.js` (`loadEventsFromSupabase` e `saveState`)

- [ ] **Step 1: Ler os novos campos do banco**

Em `loadEventsFromSupabase`, no `.map(dbEv => ({ ... }))`, adicione duas propriedades:
```javascript
      amount: dbEv.amount || 0,
      financeNotes: dbEv.finance_notes || "",
      clientId: dbEv.client_id || "cli-a-definir",
      contractStatus: dbEv.contract_status || "pendente"
```
(As duas primeiras linhas já existem; adicione apenas `clientId` e `contractStatus`.)

- [ ] **Step 2: Enviar os novos campos no upsert**

Em `saveState()`, no `appState.events.map(ev => ({ ... }))`, adicione:
```javascript
        finance_notes: ev.financeNotes || "",
        client_id: ev.clientId || "cli-a-definir",
        contract_status: ev.contractStatus || "pendente"
```
(A primeira linha já existe; adicione apenas `client_id` e `contract_status`.)

- [ ] **Step 3: Verificação manual**

Recarregue, login. No Console: `appState.events[0].clientId` e `.contractStatus`.
Expected: `"cli-a-definir"` e `"pendente"` (ou valores reais). Edite algo num evento e confirme no Supabase (Table Editor → events) que `client_id`/`contract_status` foram gravados.

- [ ] **Step 4: Commit (opcional)**
```bash
git add app-v2.js
git commit -m "feat: sincronizar client_id e contract_status nos eventos"
```

---

## Task 9: Modal de Evento — seletor de cliente, criação rápida e contrato

**Files:**
- Modify: `index.html` (campos no `#new-event-modal`)
- Modify: `app-v2.js` (`initEventModal`, submit, `updateClientDropdown`)

- [ ] **Step 1: Campos no HTML do modal de evento**

Em `index.html`, dentro do `<form id="new-event-form">`, logo após `<div class="modal-body">` e ANTES do campo "Nome do Evento", insira:
```html
          <div class="form-group">
            <label for="event-client">Dono do Evento (Cliente) *</label>
            <select id="event-client" class="form-control" required>
              <option value="" disabled selected>Selecione o cliente</option>
            </select>
            <div id="event-client-quickadd" style="display:none; margin-top:10px; padding:12px; border:1px dashed rgba(255,204,0,0.3); border-radius:10px;">
              <p style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">Deseja adicionar este cliente ao catálogo?</p>
              <input type="text" id="event-client-new-name" class="form-control" placeholder="Nome do cliente" style="margin-bottom:8px;">
              <input type="text" id="event-client-new-contact" class="form-control" placeholder="Contato do produtor (WhatsApp/e-mail)" style="margin-bottom:8px;">
              <button type="button" class="btn-primary" id="event-client-quickadd-save" style="width:100%; justify-content:center;">Adicionar e vincular</button>
            </div>
          </div>
```
E logo após o campo "Estado (UF)" (`<div class="form-group">...event-estado...</div>`), insira:
```html
          <div class="form-group">
            <label for="event-contract-status">Status do Contrato</label>
            <select id="event-contract-status" class="form-control">
              <option value="pendente" selected>Pendente</option>
              <option value="enviado">Enviado</option>
              <option value="assinado">Assinado</option>
            </select>
          </div>
```

- [ ] **Step 2: `updateClientDropdown` (popular o select)**

Em `app-v2.js`, adicione:
```javascript
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
```

- [ ] **Step 3: Ligar o seletor + criação rápida em `initEventModal`**

Em `initEventModal`, dentro do bloco que abre o modal (`openBtn.addEventListener("click", ...)`), após `addArtistBlock();`, adicione:
```javascript
      updateClientDropdown();
      const quick = document.getElementById("event-client-quickadd");
      if (quick) quick.style.display = "none";
      document.getElementById("event-contract-status").value = "pendente";
```
Ainda em `initEventModal`, ao final da função (antes do fechamento `}`), adicione os handlers de criação rápida:
```javascript
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
```

- [ ] **Step 4: Exigir cliente e gravar no submit**

No handler `form.addEventListener("submit", ...)` de `initEventModal`, logo após ler `eventEstado`, adicione a leitura e validação:
```javascript
    const eventClientId = document.getElementById("event-client").value;
    const eventContractStatus = document.getElementById("event-contract-status").value || "pendente";
    if (!eventClientId || eventClientId === "__new__") {
      showWarningToast("Selecione (ou crie) o cliente dono do evento!");
      return;
    }
```
E no objeto `const newEvent = { ... }` (dentro do `artistBlocks.forEach`), adicione:
```javascript
        status: eventStatus,
        amount: eventAmount,
        clientId: eventClientId,
        contractStatus: eventContractStatus
```
(As duas primeiras linhas já existem; adicione `clientId` e `contractStatus`.)

- [ ] **Step 5: Verificação manual**

Recarregue, login, "Novo Show". O campo "Dono do Evento" lista os clientes. Escolha "+ Novo cliente...", preencha o mini-form, clique "Adicionar e vincular" — o cliente é criado e selecionado sem fechar o modal. Defina contrato = Enviado, preencha o resto e salve. Vá em "Clientes" → o novo cliente mostra o evento no histórico com "Contrato: Enviado". Tente salvar um evento sem cliente → bloqueia com aviso.
Expected: fluxo completo funciona.

- [ ] **Step 6: Commit (opcional)**
```bash
git add index.html app-v2.js
git commit -m "feat: seletor de cliente, criacao rapida e contrato no modal de evento"
```

---

## Task 10: Cliente e contrato no grupo da Tabela de Eventos

**Files:**
- Modify: `app-v2.js` (`renderEventTable` — cabeçalho do grupo)

- [ ] **Step 1: Mostrar cliente e contrato no cabeçalho do grupo**

Em `renderEventTable`, dentro do `groupKeys.forEach`, após `const safeEstado = escapeHtml(g.estado || "");`, adicione:
```javascript
    const groupClientId = g.items[0] ? (g.items[0].clientId || "cli-a-definir") : "cli-a-definir";
    const groupContract = g.items[0] ? (g.items[0].contractStatus || "pendente") : "pendente";
    const safeClientName = escapeHtml(getClientName(groupClientId));
```
No template do cabeçalho (`groupDiv.innerHTML`), dentro de `<div class="event-group-title">`, após o bloco do campo "Estado", adicione:
```javascript
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Cliente</span>
            <span class="group-client-label">${safeClientName}</span>
          </div>
          <span class="event-group-separator">•</span>
          <div class="event-group-field">
            <span class="event-group-field-label">Contrato</span>
            <span class="badge badge-contract badge-contract-${groupContract}">${CONTRACT_LABELS[groupContract] || groupContract}</span>
          </div>
```

> Nota: edição inline do cliente direto na tabela fica para uma iteração futura (YAGNI). Por ora, o cliente é definido na criação do evento e exibido aqui; mudanças de cliente/contrato podem ser feitas recriando o evento ou em melhoria posterior. O histórico do cliente já reflete o `clientId` salvo.

- [ ] **Step 2: Verificação manual**

Recarregue, login, "Tabela de Eventos". Cada grupo de evento mostra o nome do Cliente e o badge de Contrato.
Expected: exibição correta, sem erros.

- [ ] **Step 3: Commit (opcional)**
```bash
git add app-v2.js
git commit -m "feat: exibir cliente e contrato na tabela de eventos"
```

---

## Task 11: CSS dos badges e do histórico + bump de versão

**Files:**
- Modify: `style.css`
- Modify: `index.html` (versão do script)

- [ ] **Step 1: Estilos dos badges e histórico**

Em `style.css`, no final do arquivo, adicione:
```css
/* ==========================================================================
   MÓDULO DE CLIENTES — badges e histórico
   ========================================================================== */
.badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.badge-contract-pendente { background: rgba(255,69,58,0.15); color: #ff453a; border-color: rgba(255,69,58,0.35); }
.badge-contract-enviado  { background: rgba(255,159,10,0.15); color: #ff9f0a; border-color: rgba(255,159,10,0.35); }
.badge-contract-assinado { background: rgba(48,209,88,0.15); color: #30d158; border-color: rgba(48,209,88,0.35); }
.badge-payment { background: rgba(255,255,255,0.06); color: var(--text-muted); border-color: var(--border-color); }

.client-history-item {
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
}
.client-history-main {
  display: flex; align-items: center; gap: 12px; margin-bottom: 6px;
}
.client-history-date { color: var(--text-muted); font-size: 12px; }
.client-history-lineup { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }
.client-history-lineup span { color: var(--text-main); font-weight: 600; }
.client-history-badges { display: flex; gap: 8px; flex-wrap: wrap; }
.group-client-label { font-weight: 600; }
```

- [ ] **Step 2: Bump da versão do script (cache-busting)**

Em `index.html`, troque `<script src="app-v2.js?v=15"></script>` por:
```html
  <script src="app-v2.js?v=16"></script>
```

- [ ] **Step 3: Verificação visual**

Recarregue (`Ctrl+Shift+R`). Os badges de contrato aparecem coloridos (vermelho/laranja/verde) na tabela e no histórico do cliente. O resumo de pagamento aparece como pílula.
Expected: visual consistente com o tema escuro.

- [ ] **Step 4: Commit (opcional)**
```bash
git add style.css index.html
git commit -m "feat(ui): badges de contrato/pagamento e bump de versao"
```

---

## Task 12: Verificação final ponta-a-ponta

**Files:** nenhum (QA).

- [ ] **Step 1: Sintaxe e testes**

Run:
```bash
node --check app-v2.js && npx jest
```
Expected: `SYNTAX OK` implícito (sem erro) e todos os testes Jest passando (incluindo `getPaymentStatus`).

- [ ] **Step 2: Roteiro de teste manual (admin)**

Com servidor local + login `startbookings@gmail.com`:
1. Criar cliente pelo botão "Novo Cliente".
2. Criar evento escolhendo esse cliente; testar também a criação rápida dentro do modal.
3. Tentar salvar evento sem cliente → bloqueia.
4. Ver o evento no histórico do cliente com line-up, contrato e "X/Y pagos".
5. Marcar valores recebidos num artista e conferir que o resumo de pagamento muda.
6. Tentar excluir um cliente com eventos → bloqueado; excluir um cliente vazio → ok.
Expected: todos os passos conforme os critérios de aceite da spec.

- [ ] **Step 3: Verificar RLS de clients sem login**

Run:
```bash
node -e 'const k="sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_";fetch("https://jijjacpgbnubamawbscw.supabase.co/rest/v1/clients?select=*",{headers:{apikey:k,Authorization:"Bearer "+k}}).then(async r=>console.log(r.status,(await r.text()).slice(0,80)))'
```
Expected: `200 []`.

- [ ] **Step 4: Commit final (opcional)**
```bash
git add -A
git commit -m "feat: modulo de gestao de clientes completo"
```

---

## Mapa de arquivos (referência)

| Arquivo | Responsabilidade |
|---|---|
| `supabase_clients_setup.sql` | Migração: tabela `clients`, colunas em `events`, RLS, cliente padrão |
| `index.html` | Menu "Clientes", `#clients-view`, modal de cliente, campos de cliente/contrato no modal de evento, bump de versão |
| `app-v2.js` | Estado, load/save de clientes, `renderClientsView`, integração no modal de evento e na tabela, `getPaymentStatus` |
| `style.css` | Badges de contrato/pagamento, estilos do histórico, ocultar módulo para artista |
| `__tests__/app.test.js` | Teste unitário de `getPaymentStatus` |
