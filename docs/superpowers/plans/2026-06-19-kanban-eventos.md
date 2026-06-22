# Kanban de Eventos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o Kanban um painel de eventos: um card por evento (criado automático, com checklist de 7 etapas), editor completo no card, lembrete estilo alarme e aviso central no login.

**Architecture:** Vanilla JS SPA de arquivo único (`app-v2.js`). O Kanban passa de "DOM + localStorage" para **data-driven**: `appState.eventCards` (carregado da nova tabela Supabase `event_cards`, espelhado em localStorage) é a fonte; `renderKanban()` desenha o quadro a partir de `eventCards` + `events`. Edição de evento no card reaproveita `appState.events` + `saveState()` (que já faz upsert no Supabase). Funções puras (`reminderState`, progresso da checklist) são testadas com Jest.

**Tech Stack:** HTML/CSS/JS vanilla, Supabase (Postgres + RLS), Jest + jsdom, cache-busting `?v=N`.

> **Git:** projeto NÃO usa git. Onde houver "Commit", faça o **Checkpoint**: `node --check app-v2.js && npx jest`. Nunca rode git.

> **Spec:** `docs/superpowers/specs/2026-06-19-kanban-eventos-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `supabase_kanban_setup.sql` | Tabela `event_cards` + RLS admin | Criar |
| `app-v2.js` | Helpers puros, estado/persistência, render do board, modal do card, lembretes | Modificar |
| `index.html` | Modal do card, limpeza dos cards estáticos, bump de versão | Modificar |
| `style.css` | Estilos do card (barra de progresso), modal, interruptor de lembrete | Modificar |
| `__tests__/app.test.js` | Testes das funções puras | Modificar |

---

## Fase 1 — Banco: tabela `event_cards`

### Task 1: Script SQL (RLS admin-only)

**Files:** Create: `supabase_kanban_setup.sql`

- [ ] **Step 1: Criar o arquivo**

```sql
-- =====================================================================
--  StartBookings — Kanban de Eventos: tabela event_cards (RLS admin)
--  Requer supabase_profiles_setup.sql (is_admin). SQL Editor → Run. Idempotente.
-- =====================================================================
create table if not exists public.event_cards (
  group_id   text primary key,
  coluna     text not null default 'todo' check (coluna in ('todo','progress','done')),
  checklist  jsonb not null default '[]'::jsonb,
  lembrete   jsonb,                       -- { "data":"YYYY-MM-DD", "ativo":bool }
  updated_at timestamptz not null default now()
);

alter table public.event_cards enable row level security;
drop policy if exists "event_cards_admin_all" on public.event_cards;
create policy "event_cards_admin_all" on public.event_cards
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- Conferência
select policyname, cmd from pg_policies where schemaname='public' and tablename='event_cards';
```

- [ ] **Step 2: (Usuário) rodar no Supabase SQL Editor.** Confirmar que a policy aparece. (Não há comando automatizável aqui.)

- [ ] **Step 3: Testar a RLS de fora (anon recebe vazio/erro)**

Run:
```bash
node -e 'const k="sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_";fetch("https://jijjacpgbnubamawbscw.supabase.co/rest/v1/event_cards?select=*",{headers:{apikey:k,Authorization:"Bearer "+k}}).then(async r=>console.log(r.status,(await r.text()).slice(0,60)))'
```
Expected: `200 []` (anon não-admin não enxerga linhas) — RLS ativa.

---

## Fase 2 — Funções puras + testes (TDD)

### Task 2: `DEFAULT_CHECKLIST`, `checklistProgress`, `reminderState`, `collectDueReminders`

**Files:** Modify `app-v2.js` (perto de `getLogisticsRecord`/`getLogisticsCost`, ~linha 420). Test: `__tests__/app.test.js`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Adicionar ao fim do `describe(...)` em `__tests__/app.test.js`:

```javascript
  test('DEFAULT_CHECKLIST tem 7 etapas, todas não feitas', () => {
    expect(Array.isArray(app.DEFAULT_CHECKLIST)).toBe(true);
    expect(app.DEFAULT_CHECKLIST.length).toBe(7);
    expect(app.DEFAULT_CHECKLIST.every(i => i.feito === false && typeof i.texto === 'string')).toBe(true);
  });

  test('checklistProgress conta feitos/total', () => {
    expect(app.checklistProgress([])).toEqual({ feitos: 0, total: 0 });
    expect(app.checklistProgress([{texto:'a',feito:true},{texto:'b',feito:false}])).toEqual({ feitos: 1, total: 2 });
  });

  test('reminderState deriva atrasado/chegando/nenhum', () => {
    const hoje = '2026-06-19';
    expect(app.reminderState({ lembrete: { data: '2026-06-15', ativo: true } }, hoje)).toBe('atrasado');
    expect(app.reminderState({ lembrete: { data: '2026-06-19', ativo: true } }, hoje)).toBe('chegando');
    expect(app.reminderState({ lembrete: { data: '2026-06-21', ativo: true } }, hoje)).toBe('chegando');
    expect(app.reminderState({ lembrete: { data: '2026-06-30', ativo: true } }, hoje)).toBe('nenhum');
    expect(app.reminderState({ lembrete: { data: '2026-06-15', ativo: false } }, hoje)).toBe('nenhum');
    expect(app.reminderState({ lembrete: null }, hoje)).toBe('nenhum');
    expect(app.reminderState({}, hoje)).toBe('nenhum');
  });

  test('collectDueReminders retorna só os ligados em estado de alerta', () => {
    const hoje = '2026-06-19';
    const cards = [
      { groupId:'g1', lembrete:{ data:'2026-06-15', ativo:true } },   // atrasado
      { groupId:'g2', lembrete:{ data:'2026-06-20', ativo:true } },   // chegando
      { groupId:'g3', lembrete:{ data:'2026-06-30', ativo:true } },   // distante
      { groupId:'g4', lembrete:{ data:'2026-06-15', ativo:false } }   // desligado
    ];
    const evs = [
      { groupId:'g1', event:'Festival X', estado:'SP' },
      { groupId:'g2', event:'Show Y', estado:'RJ' }
    ];
    const due = app.collectDueReminders(cards, evs, hoje);
    expect(due.map(d => d.groupId)).toEqual(['g1','g2']);
    expect(due[0]).toEqual({ groupId:'g1', eventName:'Festival X', estado:'SP', estado_alerta:'atrasado' });
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx jest -t "reminderState"`
Expected: FAIL (`app.reminderState is not a function`).

- [ ] **Step 3: Implementar**

Em `app-v2.js`, após `getLogisticsCost` (~linha 430), inserir:

```javascript
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
// "chegando" = hoje <= data <= hoje + antecedenciaDias. "atrasado" = data < hoje.
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
```

Adicionar `DEFAULT_CHECKLIST`, `checklistProgress`, `reminderState`, `collectDueReminders` ao `module.exports` (junto dos demais).

- [ ] **Step 4: Rodar testes**

Run: `npx jest`
Expected: PASS (todos, incluindo os 4 novos).

- [ ] **Step 5: Checkpoint** — `node --check app-v2.js && npx jest`.

---

## Fase 3 — Estado e persistência dos cards

### Task 3: Loader, getters, save, auto-criação/backfill, limpeza

**Files:** Modify `app-v2.js`.

- [ ] **Step 1: Adicionar `eventCards` ao estado inicial**

Localizar a definição de `appState` (procure por `clients: [], logistics: [], logisticsEvents: []`). Acrescentar `eventCards: [],` na mesma lista.
E na hidratação do localStorage no boot (procure por `JSON.parse(localStorage.getItem("sb_logistics"))`), adicionar uma linha análoga:
```javascript
  appState.eventCards = JSON.parse(localStorage.getItem("sb_event_cards")) || [];
```

- [ ] **Step 2: Loader + getters + save (após `loadLogisticsFromSupabase`, ~linha 373)**

```javascript
async function loadEventCardsFromSupabase() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient.from('event_cards').select('*');
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

// Upsert de um card no estado + localStorage + Supabase.
function saveEventCard(card) {
  const idx = appState.eventCards.findIndex(c => c.groupId === card.groupId);
  if (idx > -1) appState.eventCards[idx] = card; else appState.eventCards.push(card);
  try { localStorage.setItem("sb_event_cards", JSON.stringify(appState.eventCards)); } catch (e) { }
  if (sbClient && appState.currentRole) {
    sbClient.from('event_cards').upsert({
      group_id: card.groupId, coluna: card.coluna,
      checklist: card.checklist, lembrete: card.lembrete, updated_at: new Date().toISOString()
    }).then(({ error }) => { if (error) console.error("event_cards sync error:", error); });
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

// Chave de grupo de um evento (mesma lógica da tabela de eventos).
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
```

- [ ] **Step 3: Carregar no login (dois caminhos) + limpar Kanban antigo**

Em `app-v2.js`, no caminho de sessão restaurada (~linha 211) adicionar após `await loadLogisticsFromSupabase();`:
```javascript
        await loadEventCardsFromSupabase();
```
E no caminho do login por formulário (procure o segundo `await loadLogisticsFromSupabase();`, ~linha 739) adicionar a mesma linha logo após.

Limpeza única do modelo antigo: no boot (perto da hidratação do localStorage), adicionar:
```javascript
  try { localStorage.removeItem("sb_kanban"); } catch (e) { }
```

- [ ] **Step 4: Auto-criar card ao criar evento**

Localizar o bloco "Auto-create Kanban task" em `new-event-form` (~linha 2312-2326). SUBSTITUIR todo o `try { ... savedKanban ... } catch {...}` por:
```javascript
      // Card do Kanban é criado/garantido a partir dos eventos (ver ensureCardsForEvents).
```
E logo após `saveState();` (~linha 2333), adicionar:
```javascript
      ensureCardsForEvents();
```

- [ ] **Step 5: Remover card ao excluir o evento inteiro**

No handler de `.delete-group-btn` (~linha 1876), dentro do callback do `showConfirmModal`, existe `const key = btn.getAttribute("data-key");` e depois `saveState();`. Inserir, logo após `saveState();` (e antes de `renderEventTable();`):
```javascript
        deleteEventCard(key);
```

- [ ] **Step 6: Checkpoint** — `node --check app-v2.js && npx jest` (10+4 testes verdes; sem novas falhas).

---

## Fase 4 — Board data-driven + esconder p/ não-admin

### Task 4: `renderKanban()` + reescrita do `initKanban`

**Files:** Modify `app-v2.js` (função `initKanban`, ~linha 3279+), `index.html` (cards estáticos + botão "Nova Tarefa").

- [ ] **Step 1: Limpar cards estáticos e botão no index.html**

No `index.html`, dentro de `#kanban-view`: remover os 3 `<div class="kanban-card" ...>` de exemplo (linhas ~518-529), deixando `<div class="kanban-cards-container" data-status="todo"></div>` vazio. Remover também o botão `id="kanban-new-task-btn"` (cards agora nascem dos eventos) e o `id="kanban-archive-btn"` pode permanecer (arquivar não se aplica ao novo modelo — removê-lo do HTML para evitar confusão).

- [ ] **Step 2: Adicionar `renderKanban()`**

Inserir em `app-v2.js` (perto de `renderLogisticsDashboard` / `renderFinanceiroView`):

```javascript
function renderKanban() {
  const board = document.getElementById("kanban-board");
  if (!board) return;
  // index dos eventos por grupo
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
```

- [ ] **Step 3: Reescrever `initKanban` para o modelo data-driven**

Substituir o corpo de `initKanban` que usava `loadKanban/buildCard/saveKanban/attachCardEvents/openTaskModal` por: render via `renderKanban`, clique no card → `openEventCardModal`, drag mantém a mecânica mas o `drop` atualiza `card.coluna` e salva. Read a função inteira primeiro. A nova versão:

```javascript
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
  board.querySelectorAll(".kanban-card-container, .kanban-cards-container").forEach(col => {
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
```

> Remover as funções antigas que ficaram órfãs (`loadKanban`, `buildCard`, `attachCardEvents`, `saveKanban` antigo, `getDragAfterElement`, lógica de `archiveBtn`, `window.reloadKanbanBoard` e o uso do `task-modal`). Se `window.reloadKanbanBoard` for chamado em algum lugar, troque por `renderKanban`. Read e remova com cuidado, rodando `node --check` a cada remoção.

- [ ] **Step 4: Renderizar o Kanban ao abrir a aba e após carregar dados**

Em `switchView` (~linha 982-996), adicionar caso:
```javascript
    } else if (targetView === "kanban") {
      renderKanban();
    }
```
E nos dois caminhos de login (após `loadEventCardsFromSupabase()`), além das outras chamadas de render, adicionar `ensureCardsForEvents();` e `renderKanban();`.

- [ ] **Step 5: Esconder a aba para não-admin**

Em `applyRoleUIChanges`, no bloco de nav (junto de `navFinanceiro`), adicionar:
```javascript
  const navKanban = document.getElementById("nav-kanban-item");
```
e nas ramificações: no ramo Administrador `if (navKanban) navKanban.style.display = "block";`; no `else` `if (navKanban) navKanban.style.display = "none";`.

- [ ] **Step 6: Checkpoint** — `node --check app-v2.js && npx jest`.

---

## Fase 5 — Modal do card (editor completo + checklist + lembrete)

### Task 5: HTML do modal

**Files:** Modify `index.html`.

- [ ] **Step 1: Adicionar o modal** (perto dos outros modais, ex.: após `#task-modal` ou no fim dos modais):

```html
<div class="modal-overlay" id="event-card-modal">
  <div class="modal-content" style="max-width: 560px;">
    <div class="modal-header">
      <h2 id="event-card-title">Evento</h2>
      <button class="modal-close" id="close-event-card-modal" aria-label="Fechar">✕</button>
    </div>
    <div class="modal-body" id="event-card-body"><!-- preenchido por openEventCardModal --></div>
  </div>
</div>
```

- [ ] **Step 2: Bump de versão** do `app-v2.js` e `style.css` no `index.html` (incrementar os `?v=`).

### Task 6: `openEventCardModal(groupId)`

**Files:** Modify `app-v2.js`.

- [ ] **Step 1: Implementar o modal** (inserir perto de `renderKanban`):

```javascript
let currentCardGroup = null;

function openEventCardModal(groupId) {
  const card = getEventCard(groupId);
  if (!card) return;
  currentCardGroup = groupId;
  const shows = appState.events.filter(e => eventGroupKey(e) === groupId);
  const ev0 = shows[0] || {};
  const body = document.getElementById("event-card-body");
  document.getElementById("event-card-title").textContent = ev0.event || "Evento";

  const clientOpts = (appState.clients || []).map(c =>
    `<option value="${escapeHtml(c.id)}" ${ev0.clientId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const contractValues = [["pendente","Pendente"],["enviado","Enviado"],["assinado","Assinado"]];
  const contractOpts = contractValues.map(([v,t]) =>
    `<option value="${v}" ${ (ev0.contractStatus||"pendente")===v ? "selected":""}>${t}</option>`).join("");
  const statusValues = [["pre","Pré"],["apos","Pós"]];

  const lineup = shows.map(s => `
    <div class="card-lineup-row" data-id="${escapeHtml(String(s.id))}">
      <span class="card-lineup-artist">${escapeHtml(s.artist || "—")}</span>
      <label>Cachê R$ <input type="number" class="card-cachet" data-id="${escapeHtml(String(s.id))}" value="${parseFloat(s.amount)||0}" style="width:90px;"></label>
      <select class="card-status" data-id="${escapeHtml(String(s.id))}">
        ${statusValues.map(([v,t]) => `<option value="${v}" ${ (s.status||"pre")===v ? "selected":""}>${t}</option>`).join("")}
      </select>
      <button class="card-remove-show action-icon-btn" data-id="${escapeHtml(String(s.id))}" title="Remover artista">✕</button>
    </div>`).join("");

  const checklist = (card.checklist || []).map((it, idx) => `
    <label class="card-check-item">
      <input type="checkbox" class="card-check" data-idx="${idx}" ${it.feito ? "checked" : ""}>
      <span>${escapeHtml(it.texto)}</span>
      <button class="card-check-remove" data-idx="${idx}" title="Remover etapa">✕</button>
    </label>`).join("");
  const { feitos, total } = checklistProgress(card.checklist);

  const l = card.lembrete || { data: "", ativo: false };

  body.innerHTML = `
    <div class="card-section">
      <div class="form-row">
        <label>Data <input type="text" id="card-date" value="${escapeHtml(ev0.date||"")}" placeholder="AAAA-MM-DD"></label>
        <label>Local <input type="text" id="card-venue" value="${escapeHtml(ev0.venue||"")}"></label>
        <label>Estado <input type="text" id="card-estado" value="${escapeHtml(ev0.estado||"")}" style="width:60px;"></label>
      </div>
      <div class="form-row">
        <label>Cliente <select id="card-client">${clientOpts}</select></label>
        <label>Contrato <select id="card-contract">${contractOpts}</select></label>
      </div>
    </div>
    <div class="card-section">
      <h4>Line-up</h4>
      <div id="card-lineup">${lineup}</div>
    </div>
    <div class="card-section">
      <h4>Checklist <span class="card-check-count">${feitos}/${total}</span></h4>
      <div id="card-checklist">${checklist}</div>
      <div class="card-add-step"><input type="text" id="card-new-step" placeholder="Nova etapa..."><button class="btn-secondary" id="card-add-step-btn">+ Etapa</button></div>
    </div>
    <div class="card-section card-reminder">
      <h4>Lembrete</h4>
      <label class="card-switch">
        <input type="checkbox" id="card-reminder-active" ${l.ativo ? "checked" : ""}>
        <span class="card-switch-slider"></span>
      </label>
      <input type="date" id="card-reminder-date" value="${escapeHtml(l.data||"")}">
      <span style="color:var(--text-muted);font-size:12px;">(liga/desliga estilo alarme)</span>
    </div>
    <div class="card-footer">
      <button class="btn-secondary" id="card-save-btn">Salvar alterações</button>
      <button class="btn-danger" id="card-delete-btn">Excluir card</button>
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
  // Checklist: marcar/desmarcar
  document.querySelectorAll(".card-check").forEach(chk => chk.addEventListener("change", () => {
    const idx = parseInt(chk.getAttribute("data-idx"));
    card.checklist[idx].feito = chk.checked;
    saveEventCard(card);
    openEventCardModal(card.groupId); // re-render p/ atualizar contagem
  }));
  // Checklist: remover etapa
  document.querySelectorAll(".card-check-remove").forEach(b => b.addEventListener("click", () => {
    const idx = parseInt(b.getAttribute("data-idx"));
    card.checklist.splice(idx, 1);
    saveEventCard(card);
    openEventCardModal(card.groupId);
  }));
  // Checklist: adicionar etapa
  const addStep = document.getElementById("card-add-step-btn");
  if (addStep) addStep.addEventListener("click", () => {
    const inp = document.getElementById("card-new-step");
    const txt = (inp.value || "").trim();
    if (!txt) return;
    card.checklist.push({ texto: txt, feito: false });
    saveEventCard(card);
    openEventCardModal(card.groupId);
  });
  // Line-up: cachê e status
  document.querySelectorAll(".card-cachet").forEach(i => i.addEventListener("change", () => {
    const s = appState.events.find(e => String(e.id) === i.getAttribute("data-id"));
    if (s) { s.amount = parseFloat(i.value) || 0; saveState(); renderEventTable(); }
  }));
  document.querySelectorAll(".card-status").forEach(sel => sel.addEventListener("change", () => {
    const s = appState.events.find(e => String(e.id) === sel.getAttribute("data-id"));
    if (s) { s.status = sel.value; saveState(); renderEventTable(); }
  }));
  // Line-up: remover artista
  document.querySelectorAll(".card-remove-show").forEach(b => b.addEventListener("click", () => {
    const id = b.getAttribute("data-id");
    appState.events = appState.events.filter(e => String(e.id) !== id);
    saveState(); renderEventTable();
    if (appState.events.some(e => eventGroupKey(e) === card.groupId)) openEventCardModal(card.groupId);
    else { deleteEventCard(card.groupId); closeEventCardModal(); renderKanban(); }
  }));
  // Salvar campos do evento (aplicam a todos os shows do grupo)
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
    // lembrete
    const ativo = document.getElementById("card-reminder-active").checked;
    const rdata = document.getElementById("card-reminder-date").value;
    card.lembrete = (rdata || ativo) ? { data: rdata, ativo } : null;
    saveEventCard(card);
    saveState(); renderEventTable(); renderKanban();
    showToast("Card atualizado.");
    closeEventCardModal();
  });
  // Excluir card
  document.getElementById("card-delete-btn").addEventListener("click", () => {
    deleteEventCard(card.groupId);
    closeEventCardModal(); renderKanban();
    showToast("Card removido.");
  });
}
```

- [ ] **Step 2: Listener de fechar (no boot, junto dos outros init)**

Adicionar onde os modais são fechados / no boot:
```javascript
  const closeCardBtn = document.getElementById("close-event-card-modal");
  if (closeCardBtn) closeCardBtn.addEventListener("click", closeEventCardModal);
  const cardOverlay = document.getElementById("event-card-modal");
  if (cardOverlay) cardOverlay.addEventListener("click", (e) => { if (e.target === cardOverlay) closeEventCardModal(); });
```

- [ ] **Step 3: Checkpoint** — `node --check app-v2.js && npx jest`.

---

## Fase 6 — Aviso central de lembretes no login

### Task 7: `showDueReminders()`

**Files:** Modify `app-v2.js`.

- [ ] **Step 1: Implementar**

```javascript
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
```

> `showWarningToast` é o aviso central dourado já existente. Se ele não quebrar linha com `\n`, ajustar o CSS do toast para `white-space: pre-line;` (ver Task 8).

- [ ] **Step 2: Chamar no login (dois caminhos) e ao abrir o Kanban**

Nos dois caminhos de login, após `renderKanban();`, adicionar:
```javascript
        showDueReminders();
```
E em `switchView`, no caso `kanban`, após `renderKanban();` adicionar `showDueReminders();`.

- [ ] **Step 3: Checkpoint** — `node --check app-v2.js && npx jest`.

---

## Fase 7 — Estilos + verificação

### Task 8: CSS (barra de progresso, switch, modal, toast multilinha)

**Files:** Modify `style.css`.

- [ ] **Step 1: Acrescentar ao `style.css`**

```css
/* ---- Kanban de eventos ---- */
.kanban-progress { height: 6px; background: rgba(255,255,255,0.08); border-radius: 4px; margin-top: 8px; overflow: hidden; }
.kanban-progress-bar { height: 100%; background: var(--yellow-primary, #ffcc00); }
.kanban-progress-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

/* Modal do card */
.card-section { padding: 10px 0; border-top: 1px solid var(--border-color); }
.card-section:first-child { border-top: none; }
.card-section h4 { margin: 0 0 8px; color: var(--text-main); font-size: 14px; }
.form-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.form-row label { display: flex; flex-direction: column; font-size: 12px; color: var(--text-muted); gap: 4px; }
.form-row input, .form-row select, #card-client, #card-contract { background: var(--input-bg, #16161a); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; }
.card-lineup-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.card-lineup-artist { font-weight: 600; min-width: 90px; }
.card-check-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.card-check-remove, .card-check-item button { margin-left: auto; background: none; border: none; color: var(--text-muted); cursor: pointer; }
.card-add-step { display: flex; gap: 8px; margin-top: 8px; }
.card-add-step input { flex: 1; background: var(--input-bg, #16161a); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; }
.card-footer { display: flex; justify-content: space-between; margin-top: 14px; }
.btn-danger { background: var(--red-primary, #ff453a); color: #fff; border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; }

/* Interruptor estilo alarme */
.card-reminder { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.card-switch { position: relative; display: inline-block; width: 42px; height: 24px; }
.card-switch input { opacity: 0; width: 0; height: 0; }
.card-switch-slider { position: absolute; cursor: pointer; inset: 0; background: #555; border-radius: 24px; transition: .2s; }
.card-switch-slider::before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .2s; }
.card-switch input:checked + .card-switch-slider { background: var(--yellow-primary, #ffcc00); }
.card-switch input:checked + .card-switch-slider::before { transform: translateX(18px); }

/* Aviso central com quebra de linha (lembretes) — showWarningToast usa #toast-center-text */
#toast-center-text { white-space: pre-line; }
```

- [ ] **Step 2: Verificação no navegador (webapp-testing)**

Subir `python -m http.server 5500`. Como o login é admin-gated por captcha, validar a lógica injetando estado em `page.evaluate`:
- `appState.events` + `appState.eventCards` com um card `coluna:'todo'`, checklist 7 itens (2 feitos), lembrete atrasado ativo.
- Chamar `renderKanban()` → conferir card na coluna certa, barra 2/7, sino 🔴⏰.
- Chamar `openEventCardModal(gid)` → conferir line-up, checklist, switch do lembrete.
- Chamar `collectDueReminders(appState.eventCards, appState.events, hoje)` → 1 item atrasado.
- Sem erros no console.

Expected: tudo conforme; corrigir e repetir se preciso.

- [ ] **Step 3: Checkpoint final** — `node --check app-v2.js && npx jest`.

---

## Pós-implementação

- [ ] Atualizar `docs/historico-do-projeto.md` (Kanban de eventos).
- [ ] Atualizar memória do projeto.
- [ ] (Usuário) rodar `supabase_kanban_setup.sql` no Supabase (se ainda não rodou na Task 1) e fazer **deploy no Vercel**.
