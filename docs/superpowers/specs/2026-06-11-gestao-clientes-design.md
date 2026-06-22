# Design — Módulo de Gestão de Clientes (StartBookings)

**Data:** 2026-06-11
**Status:** Aprovado pelo usuário (aguardando revisão da spec)

## 1. Objetivo

Criar um módulo de **Gestão de Clientes** (contratantes/promotores de festas) que seja a
base hierárquica do cadastro de eventos. Todo evento passa a pertencer obrigatoriamente a
um cliente. O painel de cada cliente reúne seu histórico de produções com indicadores de
contrato e de pagamento (cachet).

Hierarquia: **Clientes → Eventos → (artistas do line-up)**.

## 2. Decisões tomadas (brainstorming)

1. **Armazenamento:** nova tabela `clients` no Supabase, com RLS, e coluna de vínculo
   `client_id` na tabela `events`. (Não usar localStorage para clientes.)
2. **Contrato:** status **por evento** (`pendente` | `enviado` | `assinado`).
3. **Pagamento (cachet):** **por artista**, **calculado** a partir de `amount` e
   `amountReceived` que já existem por linha de artista. Sem coluna nova.
4. **Eventos antigos (sem cliente):** criar cliente padrão **"A definir"** e vincular todos
   os eventos existentes a ele.
5. **Layout da tela Clientes:** lista em **acordeão** (reaproveita o visual de
   `event-group` da Tabela de Eventos; já é responsivo).
6. **Visibilidade:** módulo **somente para admin** (oculto para `role-artist`, como
   Configurações e Kanban hoje).
7. **Contato do cliente:** um único campo `contact` (WhatsApp/telefone/e-mail principal).
   Sem campo de observações nesta versão (YAGNI).

## 3. Modelo de dados

### 3.1 Nova tabela `public.clients`

| coluna | tipo | regras |
|---|---|---|
| `id` | text (PK) | gerado no app: `cli-<timestamp><rand>` |
| `name` | text | obrigatório |
| `contact` | text | opcional (WhatsApp/telefone/e-mail) |
| `created_at` | timestamptz | default `now()` |
| `created_by` | uuid | default `auth.uid()` |

### 3.2 Colunas novas em `public.events`

| coluna | tipo | regras |
|---|---|---|
| `client_id` | text | FK lógica → `clients.id`; obrigatório nos eventos novos |
| `contract_status` | text | `pendente` (default) \| `enviado` \| `assinado` |

### 3.3 Cálculo do status de pagamento (derivado, por artista)

Função pura no front (`getPaymentStatus(amount, amountReceived)`):
- `amountReceived <= 0` → `pendente` (🔴)
- `amountReceived >= amount` (e amount > 0) → `pago_total` (🟢)
- caso contrário → `sinal_pago` (🟡)

Resumo no histórico do cliente por evento: contagem `X/Y pagos` (Y = artistas do evento,
X = artistas com `pago_total`).

### 3.4 RLS (`supabase_clients_setup.sql`)

Tabela `clients`: habilitar RLS; políticas `to authenticated` reutilizando a função
`public.is_admin()` já existente:
- `clients_select` → `using ( public.is_admin() )`
- `clients_insert` → `with check ( public.is_admin() )`
- `clients_update` → `using/with check ( public.is_admin() )`
- `clients_delete` → `using ( public.is_admin() )`

> Nota: artistas não acessam o módulo de Clientes, então `select` admin-only é suficiente.
> Se no futuro o artista precisar ver o nome do promotor do próprio show, adiciona-se uma
> policy específica. Fora de escopo agora.

### 3.5 Script de migração `supabase_clients_setup.sql`

Idempotente. Executa, em ordem:
1. `create table if not exists public.clients (...)`.
2. `alter table public.events add column if not exists client_id text;`
3. `alter table public.events add column if not exists contract_status text default 'pendente';`
4. Habilita RLS + cria as 4 policies de `clients` (com `drop policy if exists` antes).
5. Insere o cliente padrão `('cli-a-definir', 'A definir', '')` com `on conflict do nothing`.
6. `update public.events set client_id = 'cli-a-definir' where client_id is null;`
7. Query de conferência listando clientes e contagem de eventos por cliente.

## 4. Camada de aplicação (app-v2.js)

### 4.1 Estado

- `appState.clients` (array) — cache espelhado em `localStorage` (`sb_clients`) e carregado
  do Supabase ao logar.
- Bump de `SB_DATA_VERSION` para `"3"` (limpa caches antigos uma vez, sem perder dados reais
  do banco, que são recarregados).

### 4.2 Funções novas (espelhando o padrão dos eventos)

- `loadClientsFromSupabase()` — `select * from clients`, mapeia para `appState.clients`,
  salva em localStorage. Chamada junto de `loadEventsFromSupabase()` no login e no
  `getSession()` inicial.
- `saveClient(client)` — `upsert` em `clients`.
- `deleteClient(id)` — se o cliente tiver eventos vinculados, **bloqueia a exclusão e avisa**
  o usuário (sugerindo reatribuir os eventos antes). Só exclui quando não há eventos ligados.
  O cliente padrão `cli-a-definir` não pode ser excluído.
- `renderClientsView()` — monta o acordeão.
- `getClientName(id)` / helper para resolver nome a partir do `client_id`.
- `getPaymentStatus(amount, received)` — derivação descrita em 3.3.

### 4.3 Sincronização

`saveState()` passa a mapear `client_id` e `contract_status` no upsert de eventos. Clientes
têm seu próprio fluxo de save (`saveClient`/`deleteClient`), não entram no upsert de eventos.

## 5. Interface

### 5.1 Navegação

- Novo item de menu **Clientes** (ícone de usuários/maleta) na sidebar, **acima** de
  "Tabela de Eventos". `id="nav-clientes-item"`.
- Oculto para artista: `body.role-artist #nav-clientes-item { display: none !important; }`.
- Nova seção `#clients-view` em `.content-body`; registrada em `initNavigation`
  (`titles`/`subtitles`).

### 5.2 Tela Clientes (`#clients-view`)

- Barra de filtro: busca por nome + botão **"Novo Cliente"**.
- Lista em acordeão reutilizando classes `event-group` / `event-table-container`:
  - **Cabeçalho do card:** nome · contato · "N evento(s)" · toggle · botões editar/excluir
    (com `aria-label`, conteúdo escapado com `escapeHtml`).
  - **Corpo (expandido) — Histórico de Produções:** itens agrupados por evento, cada um com:
    - Nome do evento + data (`formatDate`).
    - Line-up: nomes dos artistas do evento, separados por vírgula.
    - Badge **Contrato** (cor por status).
    - Badge **Pagamento**: resumo `X/Y pagos`.
- "Novo Cliente" abre um modal simples (Nome + Contato) — reusa o padrão de modais atуal.

### 5.3 Modal de Evento (`#new-event-modal`)

- Campo novo no topo: **"Dono do Evento (Cliente)"** — input com busca/seleção dos clientes.
- **Criação rápida:** ao digitar um nome inexistente, exibe a pergunta
  *"Deseja adicionar este cliente ao catálogo?"*; ao aceitar, abre mini-form inline
  (Nome pré-preenchido + Contato do produtor). Ao salvar: `saveClient`, vincula ao evento e
  segue o fluxo sem fechar o modal.
- Campo novo **"Status do Contrato"** (select Pendente/Enviado/Assinado) no nível do evento.
- Validação: cliente é **obrigatório** para salvar um evento novo.

### 5.4 Tabela de Eventos

- O **cliente** passa a ser um dado do grupo do evento (exibido junto de
  Evento/Data/Local/Estado), editável inline (admin).
- Indicador de **Contrato** do evento no grupo.
- Pagamento por artista continua na linha do artista (colunas Recebido / A receber já
  existentes); opcionalmente mostra o badge derivado.

## 6. Segurança e validação

- Todo conteúdo dinâmico (nome de cliente, contato, line-up) inserido via `innerHTML` passa
  por `escapeHtml` (mesma regra anti-XSS já aplicada na tabela/timeline/kanban).
- Acesso real garantido por RLS no banco; a ocultação de UI para artista é só conveniência.

## 7. Fora de escopo (YAGNI)

- Campo de observações no cliente.
- Contato separado por tipo (WhatsApp vs e-mail vs telefone).
- Permissão de artista enxergar dados do promotor.
- Anexos de contrato/arquivos.

## 8. Entregáveis

1. `supabase_clients_setup.sql` (rodar uma vez no SQL Editor).
2. Alterações em `index.html` (menu, seção `#clients-view`, campos no modal de evento).
3. Alterações em `app-v2.js` (estado, load/save de clientes, render, integração no modal e
   na tabela, derivação de pagamento).
4. Alterações em `style.css` (badges de contrato/pagamento; reuso de estilos do acordeão).
5. Bump de versão do `app-v2.js?v=` no `index.html`.

## 9. Critérios de aceite

- [ ] Rodar o SQL cria `clients`, as colunas em `events`, o cliente "A definir" e vincula os
  eventos antigos a ele.
- [ ] Item "Clientes" aparece no menu (acima de Eventos) só para admin.
- [ ] É possível criar/editar/excluir cliente; exclusão é bloqueada se houver eventos ligados.
- [ ] Criar evento exige escolher/`criar` um cliente; a criação rápida funciona sem fechar o
  modal.
- [ ] O histórico do cliente mostra eventos com line-up, contrato e resumo de pagamento.
- [ ] Sem login, o REST de `clients` retorna `[]` (RLS protegendo).
- [ ] Conteúdo dinâmico escapado (sem XSS).
