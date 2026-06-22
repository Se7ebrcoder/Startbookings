# StartBookings — Modularização da arquitetura (camada de código + dados)

**Data:** 2026-06-22
**Tipo:** Refatoração de arquitetura (sem mudança de comportamento)
**Status:** Design aprovado, pronto para plano de implementação

## 1. Objetivo

Reorganizar a "infraestrutura de backend" do StartBookings — hoje concentrada
num único `app-v2.js` (~4.700 linhas) — em uma arquitetura **em camadas**,
usando **módulos nativos do navegador** (`import`/`export`, ES modules), com uma
**camada de dados clara** que isola toda a conversa com o Supabase.

**Não-objetivos (escopo fechado):**
- ❌ Nenhuma mudança de comportamento, layout ou texto visível.
- ❌ Nenhuma mudança no Supabase (schema, RLS, RPCs permanecem como estão).
- ❌ Nenhuma ferramenta de build / bundler (deploy continua estático no Vercel).
- ❌ Nenhuma funcionalidade nova.
- ❌ Nenhum servidor próprio (continua SPA + Supabase).

## 2. Decisões tomadas (brainstorm)

| Decisão | Escolha |
|---|---|
| Camada a reorganizar | **Código do app + camada de dados** (sem servidor novo) |
| Mecanismo de carga | **ES modules nativos** (`type="module"`), **sem build** |
| Critério de organização | **Em camadas** (por papel técnico) |
| Estratégia de migração | **Incremental**, app sempre funcionando, cutover único reversível |

## 3. Arquitetura-alvo

Diretório novo `js/` substituindo `app-v2.js`:

```
js/
├── core/
│   ├── supabase.js     # init do sbClient, URL/chave publishable, HCAPTCHA_SITEKEY, SB_DEBUG/dbg, window.onerror
│   ├── state.js        # appState, DEFAULT_EVENTS, SB_DATA_VERSION, loadState, saveState, clearLocalPII
│   └── config.js       # constantes: statusLabels, CONTRACT_LABELS, COST_LABELS, MODE_ICONS, LEG_MODES, DEFAULT_CHECKLIST
├── utils/
│   ├── format.js       # formatCurrency, formatDate, normalizeDate, daysUntil
│   ├── dom.js          # escapeHtml, getRandomColor, hexToRgba, emptyStateHtml
│   ├── auth-errors.js  # friendlyAuthError
│   └── domain.js       # puras de negócio: getPaymentStatus, deriveLogisticsStatus, getLogisticsCost,
│                       #   checklistProgress, reminderState, collectDueReminders, legToFields
├── data/               # ÚNICA camada que fala com o Supabase
│   ├── client.js       # fetchAllRows (paginação), acesso ao sbClient, setSyncStatus hook
│   ├── events.repo.js  # loadEvents, syncEvents, deleteEventGroup
│   ├── clients.repo.js # loadClients, saveClient, deleteClient
│   ├── logistics.repo.js # loadLogistics, saveLogistics, getLogisticsRecord, getOrCreateLogistics, loadLogisticsEvents (RPC)
│   ├── eventCards.repo.js # load/save/delete event_cards, ensureCardsForEvents
│   ├── profiles.repo.js  # fetchProfileData, session_token (ler/gravar), logLogin
│   └── emails.repo.js    # loadArtistEmails, loadBookerEmails, loadLogisticsEmails
├── ui/
│   ├── toast.js        # showToast, showWarningToast, showConfirmModal
│   ├── modal.js        # initModalA11y, foco/trap, abrir/fechar
│   ├── dropdown.js     # popovers customizados (custom-dropdown, openCardSelect)
│   └── nav.js          # troca de views (data-view), applyRoleUIChanges, setSyncStatus, showAppLoading/hideAppLoading
├── features/           # 1 pasta por tela: desenha e capta interações; chama data/
│   ├── events/         # table.js (render + edição inline), modal.js (criar/editar + blocos de artista)
│   ├── clients/        # view.js, modal.js
│   ├── logistics/      # view.js, dossier.js, fields.js, print.js
│   ├── finance/        # view.js
│   ├── kanban/         # board.js, card-modal.js, reminders.js
│   ├── dashboard/      # view.js (Chart.js)
│   └── timeline/       # view.js
├── auth/
│   └── auth.js         # login, cadastro, recuperação, definir senha, logout, sessão única, hCaptcha
└── main.js             # ponto de entrada: importa, inicializa no DOMContentLoaded, conecta tudo
```

### Regra de ouro
As **features nunca chamam o Supabase diretamente** — sempre via `data/`. Toda
leitura/gravação no banco passa por um repositório. Isso entrega a "camada de
dados clara" e concentra mudanças futuras de banco num só lugar.

### Direção das dependências
`features` → `data` → `core` → (Supabase). `utils`, `ui` e `config` são
folhas usadas por todos. **Proibido** `data` importar de `features` (sem ciclos).

## 4. Como o app continua funcionando

- **`index.html`**: troca `<script src="app-v2.js?v=41">` por
  `<script type="module" src="js/main.js?v=1">`. Módulos ES já carregam
  *deferred* (rodam após o DOM), ideal para inicializar.
- **`boot.js`**: encolhe para **só o anti-flicker** (script clássico no `<head>`,
  precisa rodar antes da pintura). Toda a "cola" que ele tinha (troca de painéis,
  submit do cadastro, delegações de remover-artista/pernoite) **migra para os
  módulos** (`ui/nav.js`, `auth/auth.js`, `features/...`) via `addEventListener`.
- **Sem globais em `window`** como meta: hoje funções vivem no escopo global
  compartilhado; ao modularizar, viram `import`/`export` explícitos. Eliminar a
  dependência de `window.*` é parte do trabalho (ex.: `window.collapsedClients`
  vira estado de módulo).
- **CDNs (Chart.js, Supabase, hCaptcha)** continuam como `<script>` clássicos;
  expõem `window.Chart` / `window.supabase` / `window.hcaptcha`, que os módulos
  leem normalmente.
- **CSP**: continua endurecida. `type="module"` é servido de `'self'` — nada de
  `unsafe-inline` no script. Sem regressão.

## 5. Testes

- **Jest permanece** (jsdom). Os 18 testes atuais passam a **importar dos novos
  caminhos** de módulo (ex.: `utils/format.js`, `utils/domain.js`).
- Cada módulo **puro** extraído (`utils/`, `core/config.js`, partes de `domain.js`)
  ganha/mantém testes unitários — ficam muito mais fáceis de testar isolados.
- A camada `data/` é validada manualmente (depende do Supabase) + verificação do
  caminho real de navegação (clique → tela) a cada etapa.

## 6. Estratégia de migração (incremental e reversível)

Construção **módulo a módulo**, dos mais isolados para os mais acoplados, com o
app sempre funcional:

1. **Fundação:** `core/` + `utils/` (puros) + mover os 18 testes. Baixo risco.
2. **Dados:** `data/` (repositórios) — extrair as funções `load*FromSupabase`,
   `save*`, `fetchAllRows`, RPC.
3. **UI compartilhada:** `ui/` (toasts, modais, dropdowns, navegação).
4. **Features:** uma tela por vez (events → clients → logistics → finance →
   kanban → dashboard → timeline), cada uma chamando `data/` e `ui/`.
5. **Auth:** `auth/auth.js` + encolher `boot.js`.
6. **Cutover:** quando `js/main.js` cobre 100%, trocar o `<script>` no
   `index.html` **de uma vez**, rodar testes + passar por **todas as telas**
   (login, cadastro, eventos, clientes, logística, financeiro, kanban,
   dashboard, timeline, logout). **Rollback trivial:** reverter o `<script>`
   para `app-v2.js?v=41`. Só depois de validado, remover o `app-v2.js`.

Durante a construção (passos 1–5), o `app-v2.js` antigo permanece como
referência; o cutover (passo 6) é o único ponto de troca e é reversível em
1 linha.

## 7. Critérios de aceite

- [ ] Todas as telas funcionam **idênticas** ao comportamento atual (verificado
      clicando o caminho real, não só chamando funções).
- [ ] Login, cadastro, recuperação de senha, logout e sessão única funcionam.
- [ ] Auditoria (`audit_logs`/`login_logs`) e paginação seguem funcionando.
- [ ] Nenhum erro de CSP no Console; CSP segue sem `unsafe-inline` no script.
- [ ] Testes Jest verdes (migrados para os novos caminhos).
- [ ] Nenhuma feature/`data/` importando de `features` (sem ciclos).
- [ ] `app-v2.js` removido ao final; `boot.js` só com anti-flicker.

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Dependências de `window.*`/globais quebrarem ao modularizar | Mapear todos os usos antes; converter para `import`/`export`; cutover só após varredura |
| Ordem de inicialização (quem roda antes) | `main.js` centraliza a sequência de boot no `DOMContentLoaded` |
| Quebra silenciosa numa tela pouco usada | Checklist de cutover passando por **todas** as telas + testes |
| Arquivo grande virar muitos arquivos confusos | Limites claros por camada + regra de ouro + sem ciclos |

## 9. Versionamento e deploy

- Novos arquivos versionados com `?v=N` (cache-busting), igual hoje.
- Deploy continua estático no Vercel (sem build). `vercel.json` inalterado.
- Registrar no `docs/historico-do-projeto.md` ao concluir.
