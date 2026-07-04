# Modularização do Backend (app-v2.js → js/) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quebrar o monólito `app-v2.js` (~4.760 linhas) numa pasta `js/` de módulos ES nativos em camadas (core/utils/data/ui/features/auth/main.js), sem mudar comportamento, Supabase ou deploy.

**Architecture:** Construir toda a árvore `js/` em PARALELO (o `app-v2.js` continua servindo o app durante toda a construção). Os módulos são testáveis isoladamente via Jest desde o início. No fim, um **cutover único** troca `<script src="app-v2.js">` por `<script type="module" src="js/main.js">`; rollback = reverter essa 1 linha.

**Tech Stack:** JavaScript (ES modules nativos, sem bundler), Jest + jsdom, Supabase JS (UMD via CDN), Vercel estático.

---

## Estratégia e regras gerais

- **Mover, não reescrever:** cada função vai para o módulo verbatim (mesmo corpo), adicionando `export` e os `import` das suas dependências. Não alterar lógica.
- **`app-v2.js` permanece intocado** até o cutover (Task 17). É a rede de segurança.
- **Direção das dependências:** `features → data → core`; `utils`/`ui`/`config` são folhas. **Proibido** `data`/`core`/`utils` importarem de `features`.
- **Regra de ouro:** módulos de `features/` nunca chamam `sbClient` direto — só via `data/`.
- **Testes:** Jest importa módulos diretamente (independe do navegador). Migramos os 18 testes atuais para os novos caminhos e adicionamos testes às funções puras.
- **Commits frequentes:** um commit por task (já estamos em git, branch `main`).
- **Versão de cache:** só muda no cutover (Task 17). Durante a construção, `index.html` não muda.

### Mapa de origem → destino (referência)

| Módulo | Funções/consts movidas de `app-v2.js` (linha aprox.) |
|---|---|
| `js/core/supabase.js` | SB_DEBUG/dbg (5-11), onerror/onunhandledrejection (13-22), init sbClient (23-41), HCAPTCHA_SITEKEY (43), onHcaptchaLoad (47-64), resetCaptcha (65-77), captchaTokens/captchaWidgets |
| `js/core/config.js` | DEFAULT_* (79-86), LOGI_STATUS_LABELS (506), COST_LABELS (513), DEFAULT_CHECKLIST (533), CONTRACT_LABELS/PAYMENT_LABELS (1615-1616), VIBRANT_PALETTE (3350), MODE_ICONS (4348), LEG_MODES (4553), STATUS_LABELS (de 1832/2582) |
| `js/core/state.js` | appState (97-162), sort/group globals (163-169), loadState (bloco 134-160), saveState (681-733, parte local), clearLocalPII (671-679) |
| `js/utils/format.js` | formatCurrency (3070), daysUntil (3124), normalizeDate (3134), formatDate (3161) |
| `js/utils/dom.js` | escapeHtml (3168), parseSimpleMarkdown (3179), emptyStateHtml (3210), hexToRgba (3333), getRandomColor (3360) |
| `js/utils/auth-errors.js` | friendlyAuthError (3188) |
| `js/utils/domain.js` | getLogisticsCost (524), checklistProgress (544), reminderState (550), collectDueReminders (562), eventGroupKey (458), getPaymentStatus (3075), deriveLogisticsStatus (3084), legToFields (3090), checkArtistDateConflict (3317) |
| `js/data/client.js` | fetchAllRows (255) |
| `js/data/events.repo.js` | loadEventsFromSupabase (274), syncEventsToSupabase (extrair do saveState 689+), deleteEventFromSupabase (extrair de deleteEvent 2294) |
| `js/data/clients.repo.js` | loadClientsFromSupabase (382), saveClientToSupabase/deleteClientFromSupabase (de 633/645), getClientName (627) |
| `js/data/logistics.repo.js` | loadLogisticsFromSupabase (399), loadLogisticsEvents (480), saveLogistics (583), getLogisticsRecord (508), getOrCreateLogistics (598), splitLogistics (617), getArtistLogisticsStatus (578) |
| `js/data/eventCards.repo.js` | loadEventCardsFromSupabase (417), getEventCard (432), saveEventCard (436), deleteEventCard (448), ensureCardsForEvents (463) |
| `js/data/profiles.repo.js` | fetchProfileData (497), startSessionTokenCheck (1050), logLogin (1083) |
| `js/data/emails.repo.js` | loadArtistEmailsFromSupabase (336) |
| `js/ui/toast.js` | setSyncStatus (3263), showToast (3278), showWarningToast (3302), showAppLoading (3200), hideAppLoading (3204) |
| `js/ui/modal.js` | initModalA11y (3217), showConfirmModal (4043), showPromptModal (4082), showEditEntityModal (4137) |
| `js/ui/dropdown.js` | openCustomDropdown (3364), applyDropdownSelection (3539), openCardSelect (3711) |
| `js/ui/nav.js` | initNavigation (1173), applyRoleUIChanges (1094), getFilteredEvents (1154) |
| `js/features/dashboard/view.js` | updateDashboard (1301), renderDashboardCharts (1330) |
| `js/features/events/table.js` | renderEventTable (1782), initTableFilters (1452), updateDropdownOptions (1524), initTableSorting (1573), updateGroupField (1598), deleteEvent (2294), duplicateEventForNewArtist (3580) |
| `js/features/events/modal.js` | initEventModal (2394), addArtistBlock (2336), updateClientDropdown (2383) |
| `js/features/clients/view.js` | renderClientsView (1618) |
| `js/features/clients/modal.js` | openClientModal (1728), initClientModule (1752) |
| `js/features/timeline/view.js` | renderTimeline (2550) |
| `js/features/kanban/board.js` | initKanban (3614), renderKanban (3655), getKanbanDragAfter (4016), updateKanbanCounts (4025) |
| `js/features/kanban/card-modal.js` | openEventCardModal (3752), closeEventCardModal (3900), wireEventCardModal (3906) |
| `js/features/kanban/reminders.js` | showDueReminders (3694) |
| `js/features/finance/view.js` | initFinanceiro (4322), renderFinanceiroView (4352) |
| `js/features/logistics/view.js` | logisticsToday (4239), logisticsScheduledRows (4242), renderLogisticsDashboard (4248) |
| `js/features/logistics/form.js` | initLogisticsModule (4468), logiInput (4555), renderLegFields (4560), connectionHTML (4590), legSectionHTML (4605), openLogisticsForm (4616), attachAddConn (4670), collectLeg (4681), collectLogisticsData (4697) |
| `js/features/logistics/dossier.js` | fieldsTableHTML (4710), logisticsDossierHTML (4717), openLogisticsViewModal (4741), printLogistics (4754) |
| `js/features/settings/view.js` | initSettings (2609), updateConfigLists (2717), initColorPicker (3037) |
| `js/auth/auth.js` | initLogin (735) e tudo aninhado: realizarCadastro, login, recuperação, definir senha, handleLogout, applyRoleUIChanges-calls |
| `js/main.js` | os dois `DOMContentLoaded` (172-248 e 4032-4035) consolidados; bridge de `window.onHcaptchaLoad`/`window.realizarCadastro` |

---

## Task 1: Andaime + verificação inicial

**Files:**
- Create: `js/.keep`
- Test: `__tests__/app.test.js` (sem mudança ainda)

- [ ] **Step 1: Criar a pasta js/**

```bash
mkdir -p js/core js/utils js/data js/ui js/auth js/features/events js/features/clients js/features/logistics js/features/finance js/features/kanban js/features/dashboard js/features/timeline js/features/settings
echo "placeholder" > js/.keep
```

- [ ] **Step 2: Rodar a suíte atual (baseline verde)**

Run: `npx jest`
Expected: PASS — 18 testes (baseline antes de qualquer mudança).

- [ ] **Step 3: Commit**

```bash
git add js/.keep
git commit -m "chore: andaime da pasta js/ para modularizacao"
```

---

## Task 2: utils/format.js (funções puras de data e moeda)

**Files:**
- Create: `js/utils/format.js`
- Test: `__tests__/utils-format.test.js`

- [ ] **Step 1: Criar o módulo**

Copiar verbatim de `app-v2.js` os corpos de `formatCurrency` (3070), `daysUntil` (3124), `normalizeDate` (3134), `formatDate` (3161), trocando `function nome(` por `export function nome(`. `formatDate` usa `normalizeDate`? Não — usa só split; manter como está. Nenhuma dependência externa.

```js
// js/utils/format.js
export function formatCurrency(val) { /* corpo verbatim de app-v2.js:3070 */ }
export function daysUntil(dateStr, todayStr) { /* verbatim 3124 */ }
export function normalizeDate(input) { /* verbatim 3134 */ }
export function formatDate(dateStr) { /* verbatim 3161 */ }
```

- [ ] **Step 2: Escrever o teste**

```js
// __tests__/utils-format.test.js
import { formatCurrency, normalizeDate, daysUntil, formatDate } from '../js/utils/format.js';

test('formatCurrency formata em BRL', () => {
  expect(formatCurrency(1000)).toContain('1.000');
});
test('normalizeDate converte DD/MM/AAAA', () => {
  expect(normalizeDate('12/07/2026')).toBe('2026-07-12');
  expect(normalizeDate('2026-07-12')).toBe('2026-07-12');
  expect(normalizeDate('')).toBe('');
});
test('daysUntil calcula diferença de dias', () => {
  expect(daysUntil('2026-06-25', '2026-06-22')).toBe(3);
});
```

- [ ] **Step 3: Rodar o teste**

Run: `npx jest utils-format`
Expected: PASS.

> Nota: Jest precisa de ESM. Se `import` falhar, ver Task 2b abaixo (config). Caso o projeto já transpile, seguir.

- [ ] **Step 4: Commit**

```bash
git add js/utils/format.js __tests__/utils-format.test.js
git commit -m "feat(utils): extrai format.js (moeda/datas) com testes"
```

---

## Task 2b: Habilitar ESM no Jest (só se a Task 2 Step 3 falhar no import)

**Files:**
- Modify: `package.json`
- Create: `babel.config.cjs`

- [ ] **Step 1: Instalar babel para Jest**

Run: `npm i -D @babel/core @babel/preset-env babel-jest`
Expected: instala sem erro.

- [ ] **Step 2: Criar config do babel**

```js
// babel.config.cjs
module.exports = { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] };
```

- [ ] **Step 3: Rodar de novo**

Run: `npx jest utils-format`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json babel.config.cjs
git commit -m "chore: habilita ESM nos testes (babel-jest)"
```

---

## Task 3: utils/dom.js + utils/auth-errors.js

**Files:**
- Create: `js/utils/dom.js`, `js/utils/auth-errors.js`
- Test: `__tests__/utils-dom.test.js`

- [ ] **Step 1: Criar dom.js**

Mover verbatim `escapeHtml` (3168), `parseSimpleMarkdown` (3179), `emptyStateHtml` (3210), `hexToRgba` (3333), `getRandomColor` (3360), com `export`. `getRandomColor` usa `VIBRANT_PALETTE` → importar de config (criada na Task 5). Para não inverter a ordem, **incluir `VIBRANT_PALETTE` temporariamente no topo de dom.js** e migrar para config na Task 5.

```js
// js/utils/dom.js
const VIBRANT_PALETTE = [ /* verbatim 3350 */ ];
export function escapeHtml(text) { /* verbatim 3168 */ }
export function parseSimpleMarkdown(text) { /* verbatim 3179 */ }
export function emptyStateHtml(msg) { /* verbatim 3210 */ }
export function hexToRgba(hex, alpha) { /* verbatim 3333 */ }
export function getRandomColor() { /* verbatim 3360 (usa VIBRANT_PALETTE) */ }
```

- [ ] **Step 2: Criar auth-errors.js**

```js
// js/utils/auth-errors.js
export function friendlyAuthError(raw) { /* verbatim app-v2.js:3188 */ }
```

- [ ] **Step 3: Escrever testes**

```js
// __tests__/utils-dom.test.js
import { escapeHtml, hexToRgba } from '../js/utils/dom.js';
import { friendlyAuthError } from '../js/utils/auth-errors.js';

test('escapeHtml neutraliza HTML e tolera null/numero', () => {
  expect(escapeHtml('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  expect(escapeHtml(null)).toBe('');
  expect(escapeHtml(42)).toBe('42');
});
test('hexToRgba converte', () => {
  expect(hexToRgba('#ffcc00', 0.5)).toBe('rgba(255, 204, 0, 0.5)');
});
test('friendlyAuthError mapeia mensagens', () => {
  expect(friendlyAuthError('Invalid login credentials')).toBe('E-mail ou senha incorretos.');
  expect(friendlyAuthError('Password should be at least 8 characters')).toBe('A senha precisa ter ao menos 8 caracteres.');
});
```

- [ ] **Step 4: Rodar**

Run: `npx jest utils-dom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/utils/dom.js js/utils/auth-errors.js __tests__/utils-dom.test.js
git commit -m "feat(utils): extrai dom.js e auth-errors.js com testes"
```

---

## Task 4: utils/domain.js (regras puras de negócio)

**Files:**
- Create: `js/utils/domain.js`
- Test: `__tests__/utils-domain.test.js`

- [ ] **Step 1: Criar o módulo**

Mover verbatim com `export`: `getLogisticsCost` (524), `checklistProgress` (544), `reminderState` (550), `collectDueReminders` (562), `eventGroupKey` (458), `getPaymentStatus` (3075), `deriveLogisticsStatus` (3084), `legToFields` (3090), `checkArtistDateConflict` (3317). `getLogisticsCost` usa `COST_LABELS`? Não — só lê `record.data`. `collectDueReminders` usa `reminderState` e `eventGroupKey` (mesmo módulo). `checkArtistDateConflict` usa `appState` → recebe `events` por parâmetro? Ela hoje lê `appState.events`. Para mantê-la pura, **passar `events` como parâmetro** na assinatura nova e ajustar os chamadores na feature (Task 12). Documentar a mudança de assinatura: `checkArtistDateConflict(events, artist, date, estado, currentEventId=null)`.

```js
// js/utils/domain.js
export function eventGroupKey(e) { /* verbatim 458 */ }
export function getLogisticsCost(record) { /* verbatim 524 */ }
export function checklistProgress(list) { /* verbatim 544 */ }
export function reminderState(card, hojeStr, antecedenciaDias = 3) { /* verbatim 550 */ }
export function collectDueReminders(eventCards, events, hojeStr) { /* verbatim 562 */ }
export function getPaymentStatus(amount, received) { /* verbatim 3075 */ }
export function deriveLogisticsStatus(record) { /* verbatim 3084 */ }
export function legToFields(leg) { /* verbatim 3090 */ }
export function checkArtistDateConflict(events, artist, date, estado, currentEventId = null) { /* verbatim 3317, trocando appState.events por events */ }
```

- [ ] **Step 2: Escrever testes** (reaproveitar asserts dos testes atuais)

```js
// __tests__/utils-domain.test.js
import { getLogisticsCost, checklistProgress, reminderState, collectDueReminders, getPaymentStatus } from '../js/utils/domain.js';

test('getPaymentStatus deriva pago_total', () => {
  expect(getPaymentStatus(1000, 1000)).toBe('pago_total');
  expect(getPaymentStatus(1000, 0)).toBe('pendente');
});
test('checklistProgress conta feitos', () => {
  expect(checklistProgress([{done:true},{done:false}])).toEqual({ feitos: 1, total: 2 });
});
test('reminderState identifica atrasado/chegando', () => {
  expect(reminderState({ lembrete: { data: '2026-06-20', ativo: true } }, '2026-06-22')).toBe('atrasado');
});
```

- [ ] **Step 3: Rodar**

Run: `npx jest utils-domain`
Expected: PASS. (Ajustar asserts ao retorno real de `checklistProgress`/`reminderState` conforme app-v2.js.)

- [ ] **Step 4: Commit**

```bash
git add js/utils/domain.js __tests__/utils-domain.test.js
git commit -m "feat(utils): extrai domain.js (regras puras) com testes"
```

---

## Task 5: core/config.js (constantes) + consolidar VIBRANT_PALETTE

**Files:**
- Create: `js/core/config.js`
- Modify: `js/utils/dom.js`

- [ ] **Step 1: Criar config.js**

Mover verbatim com `export const`: `DEFAULT_ARTISTS/SELLERS/GOAL/EVENTS` (79-82), `SB_DATA_VERSION` (86), `LOGI_STATUS_LABELS` (506), `COST_LABELS` (513), `DEFAULT_CHECKLIST` (533), `CONTRACT_LABELS`/`PAYMENT_LABELS` (1615-1616), `VIBRANT_PALETTE` (3350), `MODE_ICONS` (4348), `LEG_MODES` (4553). Criar também `export const STATUS_LABELS = { antes: "Em negociação", durante: "Confirmado", apos: "Concluído" };` (de 1832/2582).

- [ ] **Step 2: dom.js passa a importar VIBRANT_PALETTE**

Em `js/utils/dom.js`, remover a const local `VIBRANT_PALETTE` e adicionar no topo:
```js
import { VIBRANT_PALETTE } from '../core/config.js';
```

- [ ] **Step 3: Rodar testes**

Run: `npx jest`
Expected: PASS (utils-dom continua verde com o import).

- [ ] **Step 4: Commit**

```bash
git add js/core/config.js js/utils/dom.js
git commit -m "feat(core): extrai config.js e centraliza VIBRANT_PALETTE"
```

---

## Task 6: core/supabase.js

**Files:**
- Create: `js/core/supabase.js`

- [ ] **Step 1: Criar o módulo**

Mover: `SB_DEBUG`/`dbg` (5-11), os handlers `window.onerror`/`window.onunhandledrejection` (13-22), o bloco de init do Supabase (23-41) — exportando `sbClient`, a const `supabaseUrl`/`supabaseKey` ficam internas. Mover `HCAPTCHA_SITEKEY` (43), `captchaWidgets`/`captchaTokens` (declarados perto de 45), `onHcaptchaLoad` (47-64), `resetCaptcha` (65-77).

```js
// js/core/supabase.js
export const SB_DEBUG = (function () { /* verbatim 5 */ })();
export function dbg() { if (SB_DEBUG) console.log.apply(console, arguments); }
window.onerror = function (msg, url, line) { console.error("SB error:", msg, "at", url, "line", line); };
window.onunhandledrejection = function (event) { console.error("SB unhandled rejection:", event.reason); };

const supabaseUrl = 'https://jijjacpgbnubamawbscw.supabase.co';
const supabaseKey = 'sb_publishable_VZAZOWTDO8ib_yxQ3muUWg_-Y1wek8_';
export let sbClient = null;
try {
  if (window.supabase) {
    sbClient = window.supabase.createClient(supabaseUrl, supabaseKey, { /* opções verbatim de app-v2.js */ });
  } else { console.error("Supabase script not loaded!"); }
} catch (err) { console.error("Supabase init error:", err); }

export const HCAPTCHA_SITEKEY = "b13a8788-f1ca-45a0-bfac-9cf82c429118";
export const captchaWidgets = {};
export const captchaTokens = { login: null, register: null, forgot: null };
export function onHcaptchaLoad() { /* verbatim 47 */ }
export function resetCaptcha(key) { /* verbatim 65 */ }
```

> `sbClient` exportado como `let` — os módulos `import { sbClient }`. Como a atribuição ocorre na carga do módulo (antes de qualquer uso), o valor estará pronto.

- [ ] **Step 2: Verificar carga (lint manual)**

Run: `node --check js/core/supabase.js`
Expected: sem erro de sintaxe.

- [ ] **Step 3: Commit**

```bash
git add js/core/supabase.js
git commit -m "feat(core): extrai supabase.js (client + hCaptcha)"
```

---

## Task 7: core/state.js

**Files:**
- Create: `js/core/state.js`

- [ ] **Step 1: Criar o módulo**

Mover: `appState` (97-162) → `export const appState = {...}` (verbatim), os globais de ordenação `currentSortColumn/currentSortOrder/currentActiveEventGroup` (163-165), `monthlyChart`/`statusDoughnutChart` (168-169) → exportar como `export let` (reatribuídos nas features de dashboard). Mover o bloco de **limpeza de versão + loadState** (86-160, a parte que lê localStorage para `appState`) numa `export function loadState()`. Mover `clearLocalPII` (671-679) e `saveState` (681-733) — MAS a parte de `saveState` que sincroniza com Supabase (mappedEvents, 689+) será chamada via `data/events.repo.js` (Task 8). Por ora, `saveState` importa `syncEventsToSupabase` de `events.repo.js`.

```js
// js/core/state.js
import { DEFAULT_EVENTS, SB_DATA_VERSION } from './config.js';
import { getRandomColor } from '../utils/dom.js';
import { syncEventsToSupabase } from '../data/events.repo.js';

export const appState = { /* verbatim 97 */ };
export let currentSortColumn = "date";
export let currentSortOrder = "asc";
export let currentActiveEventGroup = null;
export let monthlyChart = null;
export let statusDoughnutChart = null;
export function setSortColumn(c){ currentSortColumn = c; }   // setters p/ quem reatribui
export function setSortOrder(o){ currentSortOrder = o; }
export function setMonthlyChart(c){ monthlyChart = c; }
export function setStatusDoughnutChart(c){ statusDoughnutChart = c; }
export function loadState() { /* limpeza de versão (86) + leitura do localStorage (134-160) */ }
export function clearLocalPII() { /* verbatim 671 */ }
export function saveState() { /* verbatim 681, com a sync de eventos delegada a syncEventsToSupabase */ }
```

> **Importante:** `import`/`export` de `let` reatribuído entre módulos NÃO funciona por atribuição direta de fora — por isso os **setters** (`setMonthlyChart` etc.). Quem hoje faz `monthlyChart = new Chart(...)` passará a chamar `setMonthlyChart(new Chart(...))` (ajuste na Task 11).

- [ ] **Step 2: Lint**

Run: `node --check js/core/state.js`
Expected: sem erro de sintaxe (pode acusar import não resolvido só em runtime — ok).

- [ ] **Step 3: Commit**

```bash
git add js/core/state.js
git commit -m "feat(core): extrai state.js (appState, loadState, saveState, clearLocalPII)"
```

---

## Task 8: data/client.js + data/events.repo.js

**Files:**
- Create: `js/data/client.js`, `js/data/events.repo.js`

- [ ] **Step 1: data/client.js**

```js
// js/data/client.js
import { sbClient } from '../core/supabase.js';
export async function fetchAllRows(table, orderColumn) { /* verbatim app-v2.js:255 (usa sbClient) */ }
```

- [ ] **Step 2: data/events.repo.js**

Mover `loadEventsFromSupabase` (274) → usa `fetchAllRows`, `appState`, `getRandomColor`. Extrair a sincronização de eventos do `saveState` (bloco mappedEvents 689+) para `export async function syncEventsToSupabase(events, role)`. Extrair a parte Supabase de `deleteEvent` (2294) para `export function deleteEventFromSupabase(groupId)`.

```js
// js/data/events.repo.js
import { sbClient } from '../core/supabase.js';
import { fetchAllRows } from './client.js';
import { appState } from '../core/state.js';
import { getRandomColor } from '../utils/dom.js';
import { setSyncStatus } from '../ui/toast.js';

export async function loadEventsFromSupabase() { /* verbatim 274, troca o select por fetchAllRows('events','id') */ }
export async function syncEventsToSupabase(events, role) { /* bloco mappedEvents extraído de saveState */ }
export function deleteEventFromSupabase(groupId) { /* parte Supabase de deleteEvent */ }
```

> Dependência circular `state ↔ events.repo`: `state.saveState` importa `syncEventsToSupabase`; `events.repo` importa `appState`. ES modules suportam ciclos desde que o uso seja em runtime (dentro de funções), não no topo. Como ambos só usam o import dentro de funções, o ciclo é seguro.

- [ ] **Step 3: Lint**

Run: `node --check js/data/client.js && node --check js/data/events.repo.js`
Expected: sem erro de sintaxe.

- [ ] **Step 4: Commit**

```bash
git add js/data/client.js js/data/events.repo.js
git commit -m "feat(data): extrai client.js (fetchAllRows) e events.repo.js"
```

---

## Task 9: data/ restantes (clients, logistics, eventCards, profiles, emails)

**Files:**
- Create: `js/data/clients.repo.js`, `js/data/logistics.repo.js`, `js/data/eventCards.repo.js`, `js/data/profiles.repo.js`, `js/data/emails.repo.js`

- [ ] **Step 1: clients.repo.js**

Mover `loadClientsFromSupabase` (382), `getClientName` (627), e a sincronização/exclusão de cliente (de `saveClient` 633 e `deleteClient` 645 — a parte que fala com `sbClient`) como `saveClientToSupabase(client)` / `deleteClientFromSupabase(id)`. Imports: `sbClient`, `fetchAllRows`, `appState`, `setSyncStatus`.

- [ ] **Step 2: logistics.repo.js**

Mover `loadLogisticsFromSupabase` (399), `loadLogisticsEvents` (480, RPC), `saveLogistics` (583), `getLogisticsRecord` (508), `getOrCreateLogistics` (598), `splitLogistics` (617), `getArtistLogisticsStatus` (578). Imports: `sbClient`, `fetchAllRows`, `appState`, `setSyncStatus`, `deriveLogisticsStatus` (de domain).

- [ ] **Step 3: eventCards.repo.js**

Mover `loadEventCardsFromSupabase` (417), `getEventCard` (432), `saveEventCard` (436), `deleteEventCard` (448), `ensureCardsForEvents` (463). Imports: `sbClient`, `fetchAllRows`, `appState`, `eventGroupKey` (domain), `DEFAULT_CHECKLIST` (config), `setSyncStatus`.

- [ ] **Step 4: profiles.repo.js**

Mover `fetchProfileData` (497), `startSessionTokenCheck` (1050), `logLogin` (1083). Imports: `sbClient`, `dbg`, `showWarningToast` (ui/toast).

- [ ] **Step 5: emails.repo.js**

Mover `loadArtistEmailsFromSupabase` (336). Imports: `sbClient`, `fetchAllRows`, `appState`.

- [ ] **Step 6: Lint todos**

Run: `for f in js/data/*.repo.js; do node --check "$f"; done`
Expected: sem erro de sintaxe.

- [ ] **Step 7: Commit**

```bash
git add js/data/*.repo.js
git commit -m "feat(data): extrai repositorios clients/logistics/eventCards/profiles/emails"
```

---

## Task 10: ui/ (toast, modal, dropdown, nav)

**Files:**
- Create: `js/ui/toast.js`, `js/ui/modal.js`, `js/ui/dropdown.js`, `js/ui/nav.js`

- [ ] **Step 1: ui/toast.js**

Mover `setSyncStatus` (3263) + `syncStatusTimer`, `showToast` (3278), `showWarningToast` (3302), `showAppLoading` (3200), `hideAppLoading` (3204). Sem imports (puro DOM).

- [ ] **Step 2: ui/modal.js**

Mover `initModalA11y` (3217), `showConfirmModal` (4043), `showPromptModal` (4082), `showEditEntityModal` (4137). Import: `escapeHtml` (dom).

- [ ] **Step 3: ui/dropdown.js**

Mover `openCustomDropdown` (3364), `applyDropdownSelection` (3539), `openCardSelect` (3711). Imports: `appState`, `escapeHtml`, `saveState`, `renderEventTable` (de events/table — runtime, ciclo ok), `setSyncStatus`. `applyDropdownSelection` mexe em evento → chama `saveState` + re-render.

- [ ] **Step 4: ui/nav.js**

Mover `initNavigation` (1173), `applyRoleUIChanges` (1094), `getFilteredEvents` (1154). Imports: `appState`, `currentSortColumn/Order`. `initNavigation` aciona renders das views → importa as funções `render*` das features (runtime).

- [ ] **Step 5: Lint**

Run: `for f in js/ui/*.js; do node --check "$f"; done`
Expected: sem erro de sintaxe.

- [ ] **Step 6: Commit**

```bash
git add js/ui/*.js
git commit -m "feat(ui): extrai toast, modal, dropdown e nav"
```

---

## Task 11: features/dashboard + features/timeline

**Files:**
- Create: `js/features/dashboard/view.js`, `js/features/timeline/view.js`

- [ ] **Step 1: dashboard/view.js**

Mover `updateDashboard` (1301), `renderDashboardCharts` (1330). Trocar atribuições `monthlyChart = new Chart(...)` / `statusDoughnutChart = ...` por `setMonthlyChart(...)`/`setStatusDoughnutChart(...)` (de state). Imports: `appState`, `getFilteredEvents` (nav), `formatCurrency` (format), `monthlyChart`, `statusDoughnutChart`, `setMonthlyChart`, `setStatusDoughnutChart` (state), `getLogisticsCost` (domain). Usa `window.Chart` (UMD) — referenciar `window.Chart`.

- [ ] **Step 2: timeline/view.js**

Mover `renderTimeline` (2550). Imports: `appState`, `escapeHtml`, `formatDate`, `STATUS_LABELS` (config — usar a const central em vez do `statusLabels` local de 2582).

- [ ] **Step 3: Lint**

Run: `node --check js/features/dashboard/view.js && node --check js/features/timeline/view.js`
Expected: sem erro de sintaxe.

- [ ] **Step 4: Commit**

```bash
git add js/features/dashboard js/features/timeline
git commit -m "feat(features): extrai dashboard e timeline"
```

---

## Task 12: features/events (table + modal)

**Files:**
- Create: `js/features/events/table.js`, `js/features/events/modal.js`

- [ ] **Step 1: events/table.js**

Mover `renderEventTable` (1782), `initTableFilters` (1452), `updateDropdownOptions` (1524), `initTableSorting` (1573), `updateGroupField` (1598), `deleteEvent` (2294), `duplicateEventForNewArtist` (3580). Trocar o `statusLabels` local (1832) por `STATUS_LABELS` (config). `deleteEvent` chama `deleteEventFromSupabase` (events.repo) + `saveState`. Imports: `appState`, `saveState`, `escapeHtml`, `formatCurrency`, `formatDate`, `getLogisticsCost`/`getPaymentStatus` (domain), `getLogisticsRecord` (logistics.repo), `STATUS_LABELS`/`CONTRACT_LABELS` (config), `openCustomDropdown` (dropdown), `deleteEventFromSupabase` (events.repo), `showConfirmModal` (modal), setters de sort (state).

- [ ] **Step 2: events/modal.js**

Mover `initEventModal` (2394), `addArtistBlock` (2336), `updateClientDropdown` (2383), `artistBlockCounter`. Ajustar chamada de `checkArtistDateConflict` para a nova assinatura `(appState.events, artist, date, estado, id)`. Imports: `appState`, `saveState`, `escapeHtml`, `checkArtistDateConflict` (domain), `getRandomColor`, `showToast`/`showWarningToast` (toast), `ensureCardsForEvents` (eventCards.repo), `renderEventTable` (mesmo módulo-pasta).

- [ ] **Step 3: Lint**

Run: `node --check js/features/events/table.js && node --check js/features/events/modal.js`
Expected: sem erro de sintaxe.

- [ ] **Step 4: Commit**

```bash
git add js/features/events
git commit -m "feat(features): extrai events (table + modal)"
```

---

## Task 13: features/clients + features/settings

**Files:**
- Create: `js/features/clients/view.js`, `js/features/clients/modal.js`, `js/features/settings/view.js`

- [ ] **Step 1: clients/view.js**

Mover `renderClientsView` (1618). Imports: `appState`, `escapeHtml`, `formatDate`, `emptyStateHtml`, `getPaymentStatus` (domain), `CONTRACT_LABELS` (config), `getClientName` (clients.repo).

- [ ] **Step 2: clients/modal.js**

Mover `openClientModal` (1728), `initClientModule` (1752). Imports: `appState`, `saveClientToSupabase`/`deleteClientFromSupabase` (clients.repo), `saveState`, `showToast`, `renderClientsView` (mesma pasta).

- [ ] **Step 3: settings/view.js**

Mover `initSettings` (2609), `updateConfigLists` (2717), `initColorPicker` (3037), `currentEditTag`. Imports: `appState`, `saveState`, `escapeHtml`, `getRandomColor`, `showToast`, `showEditEntityModal`/`showConfirmModal` (modal), `loadArtistEmailsFromSupabase` (emails.repo).

- [ ] **Step 4: Lint**

Run: `for f in js/features/clients/*.js js/features/settings/*.js; do node --check "$f"; done`
Expected: sem erro de sintaxe.

- [ ] **Step 5: Commit**

```bash
git add js/features/clients js/features/settings
git commit -m "feat(features): extrai clients e settings"
```

---

## Task 14: features/kanban (board + card-modal + reminders)

**Files:**
- Create: `js/features/kanban/board.js`, `js/features/kanban/card-modal.js`, `js/features/kanban/reminders.js`

- [ ] **Step 1: kanban/board.js**

Mover `initKanban` (3614), `renderKanban` (3655), `getKanbanDragAfter` (4016), `updateKanbanCounts` (4025). Imports: `appState`, `escapeHtml`, `formatDate`, `checklistProgress`/`reminderState`/`eventGroupKey` (domain), `saveEventCard`/`getEventCard` (eventCards.repo), `openEventCardModal` (card-modal).

- [ ] **Step 2: kanban/card-modal.js**

Mover `openEventCardModal` (3752), `closeEventCardModal` (3900), `wireEventCardModal` (3906), `openCardSelect`? (já em ui/dropdown — importar de lá), `currentCardGroup`. Imports: `appState`, `saveState`, `escapeHtml`, `formatDate`, `getOrCreateLogistics`/`getLogisticsRecord`/`saveLogistics` (logistics.repo), `getLogisticsCost` (domain), `getEventCard`/`saveEventCard`/`deleteEventCard` (eventCards.repo), `openCardSelect` (dropdown), `LEG_MODES`/`MODE_ICONS`/`COST_LABELS`/`DEFAULT_CHECKLIST` (config), `showToast`, `renderKanban` (board), `renderEventTable` (events/table).

- [ ] **Step 3: kanban/reminders.js**

Mover `showDueReminders` (3694). Imports: `appState`, `collectDueReminders` (domain), `showWarningToast` (toast).

- [ ] **Step 4: Lint**

Run: `for f in js/features/kanban/*.js; do node --check "$f"; done`
Expected: sem erro de sintaxe.

- [ ] **Step 5: Commit**

```bash
git add js/features/kanban
git commit -m "feat(features): extrai kanban (board, card-modal, reminders)"
```

---

## Task 15: features/finance + features/logistics

**Files:**
- Create: `js/features/finance/view.js`, `js/features/logistics/view.js`, `js/features/logistics/form.js`, `js/features/logistics/dossier.js`

- [ ] **Step 1: finance/view.js**

Mover `initFinanceiro` (4322), `renderFinanceiroView` (4352). Imports: `appState`, `escapeHtml`, `formatCurrency`, `getLogisticsCost` (domain), `getLogisticsRecord`/`saveLogistics`/`getOrCreateLogistics` (logistics.repo), `MODE_ICONS`/`COST_LABELS` (config), `eventGroupKey` (domain), `setSyncStatus`.

- [ ] **Step 2: logistics/view.js**

Mover `logisticsToday` (4239), `logisticsScheduledRows` (4242), `renderLogisticsDashboard` (4248). Imports: `appState`, `escapeHtml`, `formatDate`, `getArtistLogisticsStatus`/`getLogisticsRecord` (logistics.repo), `LOGI_STATUS_LABELS` (config), `openLogisticsViewModal`/`printLogistics` (dossier), `openLogisticsForm` (form).

- [ ] **Step 3: logistics/form.js**

Mover `initLogisticsModule` (4468), `logiInput` (4555), `renderLegFields` (4560), `connectionHTML` (4590), `legSectionHTML` (4605), `openLogisticsForm` (4616), `attachAddConn` (4670), `collectLeg` (4681), `collectLogisticsData` (4697), `logisticsCreateState`, `logisticsFormCtx`. Imports: `appState`, `escapeHtml`, `saveLogistics`/`getLogisticsRecord` (logistics.repo), `LEG_MODES` (config), `showToast`, `renderLogisticsDashboard` (view).

- [ ] **Step 4: logistics/dossier.js**

Mover `fieldsTableHTML` (4710), `logisticsDossierHTML` (4717), `openLogisticsViewModal` (4741), `printLogistics` (4754), `logisticsViewCurrent`. Imports: `appState`, `escapeHtml`, `formatDate`, `legToFields` (domain), `getLogisticsRecord` (logistics.repo), `showWarningToast` (toast).

- [ ] **Step 5: Lint**

Run: `for f in js/features/finance/*.js js/features/logistics/*.js; do node --check "$f"; done`
Expected: sem erro de sintaxe.

- [ ] **Step 6: Commit**

```bash
git add js/features/finance js/features/logistics
git commit -m "feat(features): extrai finance e logistics"
```

---

## Task 16: auth/auth.js + main.js (orquestração)

**Files:**
- Create: `js/auth/auth.js`, `js/main.js`

- [ ] **Step 1: auth/auth.js**

Mover `initLogin` (735) inteiro e suas funções aninhadas: `realizarCadastro` (768), os listeners de login, recuperação, definir senha, `handleLogout` (1027). Ajustar: a validação de senha mínima 8 já está dentro; manter. Imports: `sbClient`, `captchaTokens`/`resetCaptcha` (supabase), `appState`, `saveState`, `clearLocalPII`, `loadState` (state), `friendlyAuthError` (auth-errors), `fetchProfileData`/`startSessionTokenCheck`/`logLogin` (profiles.repo), `applyRoleUIChanges` (nav), `showToast`/`showWarningToast`/`showAppLoading`/`hideAppLoading` (toast), os `load*FromSupabase` (data/*), e os `render*`/`update*` (features) para o pós-login. Expor `window.realizarCadastro` para o `boot.js` (bridge) OU passar a wirar o submit do cadastro aqui (preferir wirar aqui e remover do boot.js — ver Task 18).

- [ ] **Step 2: main.js (ponto de entrada)**

Consolidar os dois `DOMContentLoaded` (172-248 e 4032-4035). Importar e chamar, na ordem: `loadState()`, depois os `init*` (initLogin, initNavigation, initTableSorting, initTableFilters, initEventModal, initSettings, initColorPicker, initClientModule, initLogisticsModule, initKanban, initFinanceiro, initModalA11y) e o boot de sessão (getSession → carrega dados → render). Definir `window.onHcaptchaLoad = onHcaptchaLoad` no topo do módulo (bridge p/ o callback do script hCaptcha).

```js
// js/main.js
import { onHcaptchaLoad } from './core/supabase.js';
import { loadState } from './core/state.js';
import { initLogin } from './auth/auth.js';
import { initNavigation } from './ui/nav.js';
import { initModalA11y } from './ui/modal.js';
import { initTableSorting, initTableFilters } from './features/events/table.js';
import { initEventModal } from './features/events/modal.js';
import { initSettings, initColorPicker } from './features/settings/view.js';
import { initClientModule } from './features/clients/modal.js';
import { initLogisticsModule } from './features/logistics/form.js';
import { initKanban } from './features/kanban/board.js';
import { initFinanceiro } from './features/finance/view.js';
// ...demais imports necessários para o boot de sessão (load*FromSupabase, render*)

window.onHcaptchaLoad = onHcaptchaLoad;

document.addEventListener('DOMContentLoaded', async () => {
  loadState();
  initLogin(); initNavigation(); initTableSorting(); initTableFilters();
  initEventModal(); initSettings(); initColorPicker(); initClientModule();
  initLogisticsModule(); initKanban(); initFinanceiro(); initModalA11y();
  /* bloco de sessão verbatim de app-v2.js:174-247 (getSession → load* → render*) */
});
```

- [ ] **Step 3: Lint**

Run: `node --check js/auth/auth.js && node --check js/main.js`
Expected: sem erro de sintaxe.

- [ ] **Step 4: Commit**

```bash
git add js/auth js/main.js
git commit -m "feat(auth): extrai auth.js e cria main.js (orquestracao)"
```

---

## Task 17: CUTOVER — apontar o index.html para js/main.js

**Files:**
- Modify: `index.html` (linha do `<script src="app-v2.js?v=41">`)

- [ ] **Step 1: Trocar o script**

Em `index.html`, trocar:
```html
<script src="app-v2.js?v=41"></script>
```
por:
```html
<script type="module" src="js/main.js?v=1"></script>
```

- [ ] **Step 2: Servir localmente e abrir**

Run (em um terminal): `npx http-server -p 8080 -c-1 .` (ou `python -m http.server 8080`)
Abrir `http://localhost:8080` no navegador.
> hCaptcha pode recusar `localhost` se o domínio não estiver autorizado no painel hCaptcha. Se o login travar no captcha local, testar diretamente em deploy de preview (ver Step 5) ou adicionar `localhost` nos Hostnames do hCaptcha.

- [ ] **Step 3: Checklist de navegação real (TODAS as telas)**

Verificar no navegador, conferindo o Console (F12) sem erros de CSP/JS:
- [ ] Tela de login aparece; trocar Login ↔ Criar Conta ↔ Esqueci a senha.
- [ ] Login funciona (ou, se hCaptcha bloquear local, validar no preview).
- [ ] Dashboard: KPIs e os 2 gráficos renderizam.
- [ ] Eventos: tabela lista, ordenação, filtros, edição inline (cachê/status via dropdown), excluir evento.
- [ ] Criar/editar evento no modal: adicionar/remover artista, salvar.
- [ ] Clientes: acordeão, criar/editar/excluir cliente.
- [ ] Logística: lista, abrir formulário, salvar, ver dossiê, imprimir.
- [ ] Financeiro: extrato, editar valor de logística reflete no total.
- [ ] Kanban: cards, arrastar entre colunas, abrir card (checklist, lembrete, logística), salvar.
- [ ] Configurações: listas de artistas/vendedores, cores, e-mails.
- [ ] Logout: limpa `localStorage` (DevTools → Application → as chaves `sb_*` somem).

- [ ] **Step 4: Rodar os testes**

Run: `npx jest`
Expected: PASS (todos, incluindo os novos de utils).

- [ ] **Step 5: Commit (cutover) + nota de rollback**

```bash
git add index.html
git commit -m "feat: cutover para js/main.js (ES modules)"
```
> **Rollback:** se algo quebrar no deploy, reverter só esta linha do index.html para `<script src="app-v2.js?v=41"></script>` e re-deployar. O `app-v2.js` continua no repositório até a Task 19.

---

## Task 18: Encolher boot.js para só o anti-flicker

**Files:**
- Modify: `boot.js`
- Verify: `js/ui/nav.js`, `js/auth/auth.js`, `js/features/events/modal.js`, `js/features/logistics/form.js`

- [ ] **Step 1: Mover a "cola" do boot.js para os módulos**

Garantir que o que o `boot.js` fazia já está nos módulos (wirado em `init*`):
- troca de painéis (`[data-switch-panel]`) → `initLogin`/`ui/nav.js`.
- submit do cadastro → `initLogin` (auth.js).
- delegação `.remove-artist-btn` → `initEventModal` (events/modal.js).
- delegação `.logi-conn-pernoite` → `initLogisticsModule` (logistics/form.js).
Adicionar esses `addEventListener`/delegações nos respectivos `init*` se ainda não estiverem.

- [ ] **Step 2: Reduzir boot.js**

Deixar `boot.js` apenas com o anti-flicker:
```js
// boot.js — anti-flicker do login (precisa rodar antes da pintura, script clássico no <head>)
try {
  if (sessionStorage.getItem("sb_current_role")) {
    document.documentElement.classList.add("logged-in");
  }
} catch (e) {}
```

- [ ] **Step 3: Reverificar o checklist de navegação (Task 17 Step 3)**

Foco nos pontos que vinham do boot: troca de painéis, cadastro, remover-artista, pernoite. Console sem erro.

- [ ] **Step 4: Commit**

```bash
git add boot.js js/
git commit -m "refactor: boot.js so anti-flicker; cola migrada para os modulos"
```

---

## Task 19: Limpeza final + versão + registro

**Files:**
- Delete: `app-v2.js`
- Modify: `__tests__/app.test.js` (apontar imports remanescentes para `js/`), `index.html` (bump `js/main.js?v=2` se necessário), `docs/historico-do-projeto.md`

- [ ] **Step 1: Migrar/retirar o teste antigo**

Os testes que ainda importam `../app-v2.js` em `__tests__/app.test.js` passam a importar dos novos módulos (`js/utils/*`, `js/core/state.js` p/ `clearLocalPII`). Remover asserts duplicados já cobertos por `utils-*.test.js`.

- [ ] **Step 2: Rodar a suíte inteira**

Run: `npx jest`
Expected: PASS.

- [ ] **Step 3: Remover o monólito**

Run: `git rm app-v2.js`
> Só após o checklist de navegação da Task 17/18 estar 100% verde.

- [ ] **Step 4: Registrar no histórico**

Em `docs/historico-do-projeto.md`, adicionar seção "22. Modularização do backend (app-v2.js → js/)" resumindo a nova estrutura em camadas, o cutover e o rollback.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore: remove app-v2.js (monolito) e registra modularizacao"
```

---

## Critérios de aceite (conferir no fim)

- [ ] Todas as telas funcionam idênticas (checklist da Task 17 Step 3 verde).
- [ ] Login/cadastro/recuperação/logout/sessão única OK.
- [ ] Sem erro de CSP no Console; CSP segue sem `unsafe-inline` no script.
- [ ] `npx jest` verde.
- [ ] Nenhum módulo de `data`/`core`/`utils` importa de `features` (sem ciclos proibidos).
- [ ] `app-v2.js` removido; `boot.js` só anti-flicker.
- [ ] Deploy continua estático (sem build); `vercel.json` inalterado.
