# Aba Financeiro — Valores de Logística — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba Financeiro (admin-only) que define valores de logística por artista/evento; esses valores somam ao total do show na tabela de eventos (Modelo A).

**Architecture:** Vanilla JS SPA de arquivo único (`app-v2.js`). Os valores ficam no mesmo `data` (JSONB) do registro `logistics` (`ida.valor`, `volta.valor`, `hotel.valor`) — sem mudança de schema. Um helper puro `getLogisticsCost` é a fonte única do custo; a tabela de eventos e a aba Financeiro consomem esse helper. Edição salva via `saveLogistics` (já espelha localStorage + Supabase). O Booker editável é uma etapa de backend (RLS) separada e opcional, no fim.

**Tech Stack:** HTML/CSS/JS vanilla, Supabase (Postgres + RLS), Jest + jsdom (funções puras), cache-busting via `?v=N`.

> **Nota sobre git:** este projeto **não usa git** (não é repositório). Onde o template pede "Commit", faça em vez disso o **Checkpoint de verificação** indicado (rodar `node --check` + `npx jest`). Não rode comandos git.

> **Spec:** `docs/superpowers/specs/2026-06-19-financeiro-logistica-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `app-v2.js` | Helpers (`getLogisticsCost`, `COST_LABELS`), `renderFinanceiroView`, handler de input, ajustes em `renderEventTable`, navegação, esconder aba | Modificar |
| `index.html` | Item de menu "Financeiro", seção `#financeiro-view`, bump de versão | Modificar |
| `style.css` | Estilos da aba Financeiro (reaproveita classes de acordeão; poucos estilos novos) | Modificar |
| `__tests__/app.test.js` | Testes de `getLogisticsCost` e `COST_LABELS` | Modificar |
| `supabase_booker_setup.sql` | (Etapa 4, separada) Booker como papel real + RLS de edição própria | Criar |

---

## Fase 1 — Helper de custo e rótulos (funções puras + testes)

### Task 1: `getLogisticsCost` e `COST_LABELS`

**Files:**
- Modify: `app-v2.js` (após `getLogisticsRecord`, ~linha 406)
- Test: `__tests__/app.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do `describe(...)` em `__tests__/app.test.js`:

```javascript
  test('getLogisticsCost() soma ida + volta + hospedagem do registro', () => {
    const rec = { data: { ida: { modo: 'aviao', valor: 450 }, volta: { modo: 'carro_proprio', valor: 200 }, hotel: { valor: 300 } } };
    expect(app.getLogisticsCost(rec)).toBe(950);
  });

  test('getLogisticsCost() trata ausências e vazios como 0', () => {
    expect(app.getLogisticsCost(null)).toBe(0);
    expect(app.getLogisticsCost({ data: {} })).toBe(0);
    expect(app.getLogisticsCost({ data: { ida: { modo: 'uber', valor: '' }, volta: { modo: 'uber' } } })).toBe(0);
    expect(app.getLogisticsCost({ data: { ida: { valor: '150' }, volta: { valor: 150 }, hotel: null } })).toBe(300);
  });

  test('COST_LABELS mapeia o modo para o rótulo do valor', () => {
    expect(app.COST_LABELS.carro_proprio).toBe('Gasolina');
    expect(app.COST_LABELS.aviao).toBe('Passagem (avião)');
    expect(app.COST_LABELS.onibus).toBe('Passagem (ônibus)');
    expect(app.COST_LABELS.uber).toBe('Uber');
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest -t "getLogisticsCost"`
Expected: FAIL — `app.getLogisticsCost is not a function`.

- [ ] **Step 3: Implementar o mínimo**

Em `app-v2.js`, logo após a função `getLogisticsRecord` (atual ~linha 406), inserir:

```javascript
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
```

> **Nota:** se `temHospedagem` for `false`, `hotel` normalmente é `null` (custo 0). A checagem `!== false` cobre registros antigos sem o campo.

Garantir que o bloco de export de teste no fim do arquivo inclua os novos nomes. Localizar o `module.exports` existente (procure por `module.exports`) e acrescentar `getLogisticsCost` e `COST_LABELS`. Exemplo do shape esperado:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    /* ...exports existentes... */,
    getLogisticsCost,
    COST_LABELS
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest`
Expected: PASS — todos os testes (anteriores + 3 novos) verdes.

- [ ] **Step 5: Checkpoint de verificação**

Run: `node --check app-v2.js && npx jest`
Expected: sem erros de sintaxe; "Tests: N passed".

---

## Fase 2 — Tabela de eventos: colunas Cachê / Log. (R$) / Total / A Receber

> A tabela já tem uma coluna **LOGÍSTICA** que mostra o **status** (botão "Ver Logística"). Ela permanece. Aqui mexemos só no **cluster de dinheiro**: renomear `TOTAL`→`CACHÊ`, inserir `LOG. (R$)` e `TOTAL` (ambas só-leitura) antes de `RECEBIDO`, e recalcular `A RECEBER`.

### Task 2: Cabeçalho da tabela

**Files:**
- Modify: `app-v2.js:1695-1697` (thead da tabela de eventos)

- [ ] **Step 1: Ajustar os `<th>`**

Localizar (em `renderEventTable`, ~linha 1695):

```javascript
                <th class="sortable text-left" data-sort="amount">TOTAL${sortArrow("amount")}</th>
                <th class="text-left">RECEBIDO</th>
                <th class="text-left">A RECEBER</th>
```

Substituir por:

```javascript
                <th class="sortable text-left" data-sort="amount">CACHÊ${sortArrow("amount")}</th>
                <th class="text-left">LOG. (R$)</th>
                <th class="text-left">TOTAL</th>
                <th class="text-left">RECEBIDO</th>
                <th class="text-left">A RECEBER</th>
```

- [ ] **Step 2: Checkpoint**

Run: `node --check app-v2.js`
Expected: sem erros. (Visual conferido na Task 5.)

### Task 3: Linha do admin/booker (bloco `else`)

**Files:**
- Modify: `app-v2.js:1719-1768` (cálculo + bloco `else` da linha)

- [ ] **Step 1: Calcular custo e totais antes do `if (isArtist)`**

Localizar (~linha 1719):

```javascript
      const amountReceived = parseFloat(e.amountReceived) || 0;
      const amountToReceive = e.amount - amountReceived;
      const financeNotes = e.financeNotes || "";
```

Substituir por:

```javascript
      const amountReceived = parseFloat(e.amountReceived) || 0;
      const logiCost = getLogisticsCost(getLogisticsRecord(e.groupId || "", e.artist));
      const cachet = parseFloat(e.amount) || 0;
      const totalValue = cachet + logiCost;
      const amountToReceive = totalValue - amountReceived;
      const financeNotes = e.financeNotes || "";
```

- [ ] **Step 2: Inserir as células LOG. (R$) e TOTAL no bloco `else`**

Localizar no bloco `else` (linha ~1762-1768):

```javascript
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: var(--text-main);" data-id="${safeId}" data-field="amount" value="${e.amount}">
          </td>
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: #30d158;" data-id="${safeId}" data-field="amountReceived" value="${amountReceived}">
          </td>
          <td class="price-text text-left" style="color: #ff453a; font-weight: 700;">${formatCurrency(amountToReceive)}</td>
```

Substituir por:

```javascript
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: var(--text-main);" data-id="${safeId}" data-field="amount" value="${e.amount}">
          </td>
          <td class="price-text text-left" style="color: var(--text-muted);">${logiCost > 0 ? '+' + formatCurrency(logiCost) : '—'}</td>
          <td class="price-text text-left" style="font-weight: 700;">${formatCurrency(totalValue)}</td>
          <td class="text-left">
            <input type="number" class="inline-edit-input" style="text-align: left; font-weight: 700; width: 100px; color: #30d158;" data-id="${safeId}" data-field="amountReceived" value="${amountReceived}">
          </td>
          <td class="price-text text-left" style="color: #ff453a; font-weight: 700;">${formatCurrency(amountToReceive)}</td>
```

- [ ] **Step 3: Checkpoint**

Run: `node --check app-v2.js`
Expected: sem erros.

### Task 4: Linha do artista (bloco `if (isArtist)`)

**Files:**
- Modify: `app-v2.js:1736-1742` (bloco `if (isArtist)`)

- [ ] **Step 1: Inserir as células e usar o total**

Localizar (linha ~1739-1741):

```javascript
          <td class="price-text text-left">${formatCurrency(e.amount)}</td>
          <td class="price-text text-left" style="color: #30d158;">${formatCurrency(amountReceived)}</td>
          <td class="price-text text-left" style="color: #ff453a;">${formatCurrency(amountToReceive)}</td>
```

Substituir por:

```javascript
          <td class="price-text text-left">${formatCurrency(cachet)}</td>
          <td class="price-text text-left" style="color: var(--text-muted);">${logiCost > 0 ? '+' + formatCurrency(logiCost) : '—'}</td>
          <td class="price-text text-left" style="font-weight: 700;">${formatCurrency(totalValue)}</td>
          <td class="price-text text-left" style="color: #30d158;">${formatCurrency(amountReceived)}</td>
          <td class="price-text text-left" style="color: #ff453a;">${formatCurrency(amountToReceive)}</td>
```

> O artista agora tem as mesmas 5 colunas de dinheiro (Cachê/Log./Total/Recebido/A Receber). A coluna de status de logística no fim continua igual.

- [ ] **Step 2: Checkpoint**

Run: `node --check app-v2.js && npx jest`
Expected: sem erros; testes verdes.

### Task 5: Verificação visual da tabela

- [ ] **Step 1: Subir o servidor local (se não estiver no ar)**

Run: `python -m http.server 5500` (em background) e abrir `http://localhost:5500/index.html`.

- [ ] **Step 2: Conferir manualmente**

Logar como admin. Em um show com logística com valores definidos (ou definir na Fase 3 e voltar), confirmar:
- Coluna CACHÊ editável; LOG. (R$) mostra `+R$X`; TOTAL = cachê + log; A RECEBER = total − recebido.
- Editar o cachê recalcula TOTAL e A RECEBER.

Expected: valores batem. (Sem logística → LOG. mostra "—" e TOTAL = cachê.)

---

## Fase 3 — A aba Financeiro

### Task 6: Item de menu + seção + esconder para não-admin

**Files:**
- Modify: `index.html` (menu lateral; nova seção `#financeiro-view`)
- Modify: `app-v2.js` (`applyRoleUIChanges`, `initNavigation` subtitles)

- [ ] **Step 1: Adicionar o item de menu**

No `index.html`, localizar o bloco `<li id="nav-logistica-item">` (linhas ~222-232). Logo **após** o `</li>` dele, inserir:

```html
        <li id="nav-financeiro-item">
          <a class="menu-item" role="button" tabindex="0" data-view="financeiro">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
            Financeiro
          </a>
        </li>
```

- [ ] **Step 2: Adicionar a seção da view**

No `index.html`, após a seção `#logistics-view` (procure por `id="logistics-view"`), adicionar:

```html
<section id="financeiro-view" class="view-section" style="display:none;">
  <div id="financeiro-list"></div>
</section>
```

- [ ] **Step 3: Esconder a aba para não-admin**

Em `app-v2.js`, dentro de `applyRoleUIChanges`, no bloco de permissões de navegação (~linha 897-907), adicionar a referência e as regras. Localizar:

```javascript
  const navSettings = document.getElementById("nav-settings-item");
  const navTimeline = document.querySelector('[data-view="timeline"]')?.parentElement;
```

Adicionar abaixo:

```javascript
  const navFinanceiro = document.getElementById("nav-financeiro-item");
```

E nas ramificações de papel, garantir que só admin veja. Localizar o bloco:

```javascript
  if (roleType === "Booker") {
    if (navSettings) navSettings.style.display = "none";
    if (navTimeline) navTimeline.style.display = "none";
  } else if (roleType === "Administrador") {
    if (navSettings) navSettings.style.display = "block";
    if (navTimeline) navTimeline.style.display = "block";
  }
```

Substituir por:

```javascript
  if (roleType === "Administrador") {
    if (navSettings) navSettings.style.display = "block";
    if (navTimeline) navTimeline.style.display = "block";
    if (navFinanceiro) navFinanceiro.style.display = "block";
  } else {
    // Artista, Booker, Logística: sem Financeiro
    if (navFinanceiro) navFinanceiro.style.display = "none";
    if (roleType === "Booker") {
      if (navSettings) navSettings.style.display = "none";
      if (navTimeline) navTimeline.style.display = "none";
    }
  }
```

- [ ] **Step 4: Título e subtítulo da view**

Em `app-v2.js`, em `initNavigation`, adicionar a entrada no objeto `subtitles` (~linha 936):

```javascript
    financeiro: "Valores de logística por artista; refletem no total dos eventos.",
```

E no objeto `titles` (~linha 947), adicionar:

```javascript
    financeiro: "Financeiro",
```

- [ ] **Step 5: Checkpoint**

Run: `node --check app-v2.js`
Expected: sem erros.

### Task 7: `renderFinanceiroView()`

**Files:**
- Modify: `app-v2.js` (nova função; chamada na troca de view)

- [ ] **Step 1: Escrever a função de render**

Adicionar em `app-v2.js` (perto das outras funções de render, ex.: após `renderLogisticsDashboard`). Esta função monta o acordeão por evento, reaproveitando o agrupamento por `group_id`:

```javascript
function renderFinanceiroView() {
  const host = document.getElementById("financeiro-list");
  if (!host) return;

  // Agrupar shows por evento (mesma chave usada na tabela de eventos)
  const groups = {};
  appState.events.forEach(e => {
    const key = e.groupId || `${e.event}|${e.date}|${e.venue}|${e.estado || ''}`;
    if (!groups[key]) groups[key] = { event: e.event, date: e.date, items: [] };
    groups[key].items.push(e);
  });

  const keys = Object.keys(groups);
  if (keys.length === 0) {
    host.innerHTML = `<p style="color:var(--text-muted); padding:20px;">Nenhum evento cadastrado.</p>`;
    return;
  }

  host.innerHTML = keys.map(key => {
    const g = groups[key];
    let eventTotal = 0;

    const artistsHtml = g.items.map(e => {
      const rec = getLogisticsRecord(e.groupId || "", e.artist);
      const cost = getLogisticsCost(rec);
      eventTotal += cost;
      const safeArtist = escapeHtml(e.artist || "");
      const safeId = escapeHtml(String(e.id));

      if (!rec || !rec.data) {
        return `<div class="fin-artist">
          <div class="fin-artist-head"><strong>${safeArtist}</strong>
            <span style="color:var(--text-muted); font-size:12px;">Defina a logística na aba Logística primeiro</span></div>
        </div>`;
      }

      const d = rec.data;
      const legRow = (legKey, leg) => {
        if (!leg || !leg.modo) return "";
        const label = COST_LABELS[leg.modo] || "Transporte";
        const tag = legKey === "ida" ? "IDA" : "VOLTA";
        return `<div class="fin-leg">
          <span class="fin-leg-label">${tag} · ${escapeHtml(label)}</span>
          <span class="fin-input-wrap">R$
            <input type="number" class="fin-value-input inline-edit-input" data-rec="${escapeHtml(rec.id)}" data-leg="${legKey}" value="${parseFloat(leg.valor) || ''}" placeholder="0">
          </span></div>`;
      };

      const hotelRow = (d.temHospedagem !== false && d.hotel)
        ? `<div class="fin-leg">
            <span class="fin-leg-label">🏨 Hospedagem</span>
            <span class="fin-input-wrap">R$
              <input type="number" class="fin-value-input inline-edit-input" data-rec="${escapeHtml(rec.id)}" data-leg="hotel" value="${parseFloat(d.hotel.valor) || ''}" placeholder="0">
            </span></div>`
        : "";

      return `<div class="fin-artist">
        <div class="fin-artist-head"><strong>${safeArtist}</strong>
          <span class="fin-artist-total">${formatCurrency(cost)}</span></div>
        ${legRow("ida", d.ida)}
        ${legRow("volta", d.volta)}
        ${hotelRow}
      </div>`;
    }).join("");

    return `<div class="fin-event">
      <div class="fin-event-head">
        <strong>${escapeHtml(g.event || "Evento")} ${g.date ? "— " + formatDate(g.date) : ""}</strong>
        <span class="fin-event-total">Logística do evento: ${formatCurrency(eventTotal)}</span>
      </div>
      <div class="fin-event-body">${artistsHtml}</div>
    </div>`;
  }).join("");
}
```

- [ ] **Step 2: Chamar a função quando a aba abre**

Em `app-v2.js`, na função `switchView` (~linha 982-996), localizar o fim da cadeia de `if/else if`:

```javascript
    } else if (targetView === "logistics") {
      renderLogisticsDashboard();
    }
```

Substituir por:

```javascript
    } else if (targetView === "logistics") {
      renderLogisticsDashboard();
    } else if (targetView === "financeiro") {
      renderFinanceiroView();
    }
```

- [ ] **Step 3: Checkpoint**

Run: `node --check app-v2.js`
Expected: sem erros.

### Task 8: Handler de edição dos valores (salvar automático)

**Files:**
- Modify: `app-v2.js` (listener delegado para `.fin-value-input`)

- [ ] **Step 1: Adicionar o listener delegado**

Em `app-v2.js`, dentro de `renderFinanceiroView` **NÃO** — usar delegação global para sobreviver a re-renders. Adicionar uma vez (ex.: numa função `initFinanceiro()` chamada no boot, junto das outras `init*`), o listener:

```javascript
function initFinanceiro() {
  const host = document.getElementById("financeiro-list");
  if (!host) return;
  host.addEventListener("change", (ev) => {
    const input = ev.target.closest(".fin-value-input");
    if (!input) return;
    const recId = input.getAttribute("data-rec");
    const legKey = input.getAttribute("data-leg"); // "ida" | "volta" | "hotel"
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
    renderFinanceiroView();           // atualiza os totais do Financeiro
    if (typeof renderEventTable === "function") renderEventTable(); // reflete na tabela de eventos
    showToast("Valor de logística salvo.");
  });
}
```

- [ ] **Step 2: Chamar `initFinanceiro()` no boot**

Localizar onde as funções de init são chamadas no carregamento (procure por `initKanban()` / `initNavigation()`), e adicionar `initFinanceiro();` junto.

- [ ] **Step 3: Checkpoint**

Run: `node --check app-v2.js && npx jest`
Expected: sem erros; testes verdes.

### Task 9: Estilos da aba Financeiro

**Files:**
- Modify: `style.css` (estilos `fin-*`)

- [ ] **Step 1: Adicionar CSS**

Acrescentar ao `style.css` (seguindo as variáveis do tema já usadas no arquivo):

```css
/* ---- Aba Financeiro ---- */
.fin-event { background: var(--card-bg, #1c1c22); border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 14px; overflow: hidden; }
.fin-event-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: rgba(255,255,255,0.03); }
.fin-event-total { color: var(--yellow-primary, #ffcc00); font-weight: 700; font-size: 14px; }
.fin-event-body { padding: 8px 18px 16px; }
.fin-artist { padding: 10px 0; border-top: 1px solid var(--border-color); }
.fin-artist:first-child { border-top: none; }
.fin-artist-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.fin-artist-total { color: var(--text-muted); font-weight: 600; }
.fin-leg { display: flex; justify-content: space-between; align-items: center; padding: 4px 0 4px 14px; font-size: 13px; }
.fin-leg-label { color: var(--text-muted); }
.fin-input-wrap { color: var(--text-muted); font-size: 12px; }
.fin-value-input { width: 110px; margin-left: 6px; text-align: right; }
```

- [ ] **Step 2: Bump de versão**

Em `index.html`, incrementar o `?v=` de `style.css` e `app-v2.js` (ex.: `style.css?v=13`, `app-v2.js?v=26`).

- [ ] **Step 3: Verificação visual (webapp-testing / navegador)**

Abrir `http://localhost:5500/index.html`, logar como admin, abrir **Financeiro**. Confirmar:
- Acordeão por evento; artistas com trechos rotulados pelo modo; campos de R$.
- Editar um valor → toast, total do evento atualiza, e a tabela de Eventos reflete (TOTAL/A RECEBER).
- Artista sem logística → aviso "defina a logística primeiro".
- Logar como Artista/Booker → o menu **Financeiro não aparece**.

Expected: tudo conforme. Corrigir e repetir se necessário.

---

## Fase 4 — (Opcional/separada) Booker editável com RLS

> Esta fase mexe na **segurança**. Pode ser feita depois, isolada. Sem ela, o Booker continua só-leitura (e edições no front não persistiriam de qualquer forma). Faça e teste isolado.

### Task 10: Script SQL `supabase_booker_setup.sql`

**Files:**
- Create: `supabase_booker_setup.sql`

- [ ] **Step 1: Escrever o script (idempotente)**

```sql
-- =====================================================================
--  StartBookings — Booker como papel real + RLS de edição própria
--  Requer supabase_profiles_setup.sql já rodado (is_admin etc.).
--  SQL Editor → New query → cole tudo → Run. Idempotente.
-- =====================================================================

-- 1) Papel 'Booker' aceito em profiles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin','Artista','Logistica','Booker'));

-- 2) Mapa e-mail -> nome do booker (controlado pelo admin)
create table if not exists public.booker_emails (
  email text primary key,
  booker_name text not null
);
alter table public.booker_emails enable row level security;
drop policy if exists "booker_emails_admin_all" on public.booker_emails;
create policy "booker_emails_admin_all" on public.booker_emails
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- 3) Nome do booker logado, lido de profiles (SECURITY INVOKER)
create or replace function public.current_booker_name()
returns text language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select p.artist_name from public.profiles p
      where p.id = auth.uid() and p.role = 'Booker'), '')
$$;
-- (reutiliza a coluna artist_name de profiles para guardar o nome do booker)

-- 4) Trigger de signup: marca 'Booker' pelo mapa e grava o nome
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role   text := 'Artista';
  v_name   text;
begin
  if lower(coalesce(new.email,'')) in ('admin@startbookings.com','startbookings@gmail.com') then
    v_role := 'Admin';
  elsif exists (select 1 from public.logistics_emails le where lower(le.email)=lower(coalesce(new.email,''))) then
    v_role := 'Logistica';
  elsif exists (select 1 from public.booker_emails be where lower(be.email)=lower(coalesce(new.email,''))) then
    v_role := 'Booker';
    select be.booker_name into v_name from public.booker_emails be where lower(be.email)=lower(coalesce(new.email,''));
  end if;

  if v_name is null then
    select ae.artist_name into v_name from public.artist_emails ae where lower(ae.email)=lower(coalesce(new.email,''));
  end if;

  insert into public.profiles (id, email, role, artist_name)
  values (new.id, lower(coalesce(new.email,'')), v_role, v_name)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- 5) Backfill p/ bookers já existentes
update public.profiles p
  set role='Booker', artist_name=be.booker_name
  from public.booker_emails be
  where lower(p.email)=lower(be.email) and p.role <> 'Admin';

-- 6) Policies de events: booker lê e edita só os shows que vendeu
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname='public' and tablename='events' loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

create policy "events_select" on public.events
  for select to authenticated
  using (
    (select public.is_admin())
    or artist = (select public.current_artist_profile())
    or vendedor = (select public.current_booker_name())
  );

create policy "events_insert" on public.events
  for insert to authenticated
  with check ( (select public.is_admin()) );

create policy "events_update" on public.events
  for update to authenticated
  using ( (select public.is_admin()) or vendedor = (select public.current_booker_name()) )
  with check ( (select public.is_admin()) or vendedor = (select public.current_booker_name()) );

create policy "events_delete" on public.events
  for delete to authenticated
  using ( (select public.is_admin()) );

-- 7) >>> PREENCHA os bookers (admin) <<<
insert into public.booker_emails (email, booker_name) values
  ('rayannecaldas@gmail.com', 'Rayanne'),
  ('mheloisasoaresth@gmail.com', 'Heloísa')
on conflict (email) do update set booker_name = excluded.booker_name;

update public.profiles p set role='Booker', artist_name=be.booker_name
  from public.booker_emails be
  where lower(p.email)=lower(be.email) and p.role <> 'Admin';

-- 8) Conferência
select policyname, cmd from pg_policies where schemaname='public' and tablename='events' order by policyname;
select id, email, role, artist_name from public.profiles order by role;
```

- [ ] **Step 2: Rodar no Supabase**

O usuário cola o script no SQL Editor e roda. Conferir que as 4 policies de `events` aparecem e os bookers viraram `role='Booker'`.

- [ ] **Step 3: Testar a RLS de fora (sem precisar de UI)**

Após um booker logar uma vez (para existir sessão), validar que ele só enxerga os próprios shows. Teste manual no app: logar como booker, confirmar que a tabela mostra só os shows vendidos por ele e que **editar cachê/recebido salva** (recarregar a página e ver o valor persistido). Logar como outro booker e confirmar que **não** vê os shows do primeiro.

Expected: isolamento por `vendedor` confirmado; edição persiste.

### Task 11: Front — liberar edição inline para o Booker

**Files:**
- Modify: `app-v2.js` (a linha já usa o bloco `else` para não-artista; o Booker já cai nele)

- [ ] **Step 1: Confirmar que o Booker usa o bloco editável**

Em `renderEventTable`, `isArtist` é `role === "Artista" || role.includes("(Artista)")`. O Booker **não** é artista, então já cai no bloco `else` (editável). A coluna de AÇÕES (excluir) já é condicionada a `(Admin)`. Verificar que nenhuma checagem extra bloqueia o Booker de editar `amount`/`amountReceived`/`status`. Se houver, ajustar para permitir Booker nas linhas dele (mas **não** a coluna LOG. (R$), que é só-leitura para todos na tabela).

- [ ] **Step 2: Verificação**

Logar como booker (após Task 10), editar o cachê de um show seu, recarregar, confirmar persistência. Confirmar que a aba Financeiro continua escondida para ele.

Expected: edição do booker funciona e persiste; sem acesso a Financeiro.

- [ ] **Step 3: Bump de versão e checkpoint final**

Em `index.html`, bump do `?v=` de `app-v2.js`. Run: `node --check app-v2.js && npx jest`. Expected: sem erros; testes verdes.

---

## Pós-implementação

- [ ] Atualizar `docs/historico-do-projeto.md` com a aba Financeiro (e Booker editável, se a Fase 4 for feita).
- [ ] Atualizar a memória do projeto (`startbookings-modulo-logistica` e/ou nova) registrando o Financeiro.
- [ ] **Deploy no Vercel** para valer em produção.
