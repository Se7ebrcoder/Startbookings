# Kanban de Eventos — design

> Data: 2026-06-19
> Feature 2 de 2 (a 1ª, aba Financeiro, já foi entregue).

## Objetivo

Transformar o Kanban num painel para **gerenciar eventos**. Cada evento vira **um card** (criado automaticamente ao criar o evento). Abrir o card abre um **editor completo do evento** (dados do evento + line-up dos artistas) mais uma **checklist** de etapas para acompanhar o progresso. Card, checklist, coluna e lembrete ficam no **Supabase** (compartilhado). Acesso **só admin** por enquanto.

## Decisões aprovadas pelo usuário

1. **Card = editor completo do evento** (não só checklist nem só atalho).
2. **Um card por EVENTO** (group_id), abrangendo todos os artistas (line-up).
3. **Persistência no Supabase** (tabela nova `event_cards`), espelhada em localStorage.
4. **Checklist padrão completa (7 etapas)** ao criar um evento; editável por card.
5. **Acesso: só admin** vê e edita o Kanban (booker, logística e artista não veem).
6. **Lembrete opcional estilo alarme:** cada card pode ter data de lembrete + interruptor liga/desliga. Quando ligado, aparece um **aviso central** no login (e ao abrir o Kanban) se estiver "chegando ao fim" ou "atrasado". Detalhes na seção "Lembretes".

## Modelo de dados

### Tabela nova `event_cards` (Supabase)
| Coluna | Tipo | Notas |
|---|---|---|
| `group_id` | text PK | mesmo `group_id` do evento em `events` |
| `coluna` | text | `todo` \| `progress` \| `done` (default `todo`) |
| `checklist` | jsonb | array de `{ "texto": string, "feito": bool }` (default `[]`) |
| `lembrete` | jsonb | `{ "data": "YYYY-MM-DD", "ativo": bool }` (opcional) — ver "Lembretes" |
| `updated_at` | timestamptz | default `now()` |

RLS: **admin-only** em todas as operações (`using/with check = is_admin()`). Script: `supabase_kanban_setup.sql`.

### Estado no front
- `appState.eventCards` (array). Carregado de `event_cards` no login (como `events`/`logistics`), espelhado em `localStorage` (`sb_event_cards`).
- Helper `getEventCard(groupId)` → registro ou `null`.
- Helper `saveEventCard(card)` → upsert no estado + localStorage + Supabase (mesmo padrão de `saveLogistics`).
- Constante `DEFAULT_CHECKLIST` (7 itens, todos `feito:false`):
  Iniciar negociação · Escolher artistas · Fechar valores (cachê) · Enviar contrato · Receber sinal · Fazer logísticas dos artistas · Acerto final / pagamento.

### Agrupamento evento↔card
Eventos são agrupados por `group_id` (vários shows/artistas por grupo). O card é por grupo. Os dados de nível de evento (nome, data, local, estado, cliente, contrato) valem para **todos os shows do grupo**; a line-up são os shows individuais (artista + cachê + status + recebido).

## Ciclo de vida do card

- **Auto-criação:** ao criar um evento (em `new-event-form`), se ainda não existe `event_cards` para aquele `group_id`, cria um com `coluna='todo'` e `checklist = DEFAULT_CHECKLIST`.
- **Backfill:** ao abrir o Kanban (`renderKanban`), todo `group_id` de `appState.events` sem card ganha um com a checklist padrão (idempotente).
- **Limpeza:** ao excluir um evento inteiro (delete-group), remover o `event_cards` daquele `group_id` (estado + Supabase).
- **Aposentadoria do Kanban antigo:** o modelo localStorage `sb_kanban` (tarefas genéricas) é substituído. Limpeza única de `sb_kanban` no boot (não migra — as tarefas antigas não tinham vínculo com eventos).

## O quadro (board)

- Mantém as **3 colunas**: A Fazer (`todo`) / Em Andamento (`progress`) / Concluído (`done`).
- `renderKanban()` reconstrói as colunas a partir de `appState.eventCards` + `appState.events` (para o título/dados do evento).
- **Card no quadro:** nome do evento + data, cliente, lista de artistas (resumida) e **barra de progresso** `feitos/total` da checklist.
- **Drag & drop** entre colunas: ao soltar, atualiza `coluna` no card e salva (`saveEventCard`). Reaproveita a mecânica de drag atual.
- Contagem por coluna no cabeçalho (já existe).

## O card aberto (modal)

Clicar no card abre `openEventCardModal(groupId)`:

- **Dados do evento** (editáveis; aplicam a todos os shows do grupo): data, local, estado, cliente (dropdown existente), contrato (dropdown existente). Salvar atualiza todos os `events` do grupo + sync (reaproveita a lógica de edição já usada na tabela de eventos).
- **Line-up:** lista dos shows do grupo; por artista: cachê (input), status (dropdown), botão remover (x); botão "+ adicionar artista". Reaproveita `add-artist-to-group` e o delete de show já existentes.
- **Checklist:** itens `{texto, feito}` — marcar/desmarcar (checkbox), adicionar etapa (input + botão), remover etapa (x). Cada mudança salva em `event_cards.checklist`.
- **Lembrete (estilo alarme):** input de data + um **interruptor liga/desliga** (como o alarme do celular). Com o interruptor LIGADO, o lembrete entra nos alertas centrais (ver seção "Lembretes"); DESLIGADO, fica salvo mas não alerta. O lembrete é uma **escolha**, nunca obrigatório.
- **Excluir card:** remove só o card (não o evento).
- Fecha no X / fora do modal (seguindo o padrão dos outros modais; o de logística não fecha fora, mas este pode fechar fora — sem dado destrutivo não salvo, pois salva ao editar).

## Lembretes (alertas centrais — estilo alarme)

O lembrete é **opcional** e funciona como um alarme de celular: cada card tem uma **data de lembrete** e um **interruptor liga/desliga** (`lembrete.ativo`). Só lembretes **ligados** alertam.

**Quando alerta (avaliado no login e ao abrir o Kanban):** para cada card com `lembrete.ativo = true`:
- **Chegando ao fim** (a data está próxima): hoje está dentro da janela de antecedência (padrão **3 dias** antes da data, inclusive a data). Mensagem amarela: *"⏰ A fazer chegando ao fim: <evento>"*.
- **Atrasado** (a data já passou): hoje > data. Mensagem vermelha: *"⚠️ A fazer ATRASADO: <evento>"*.
- Fora dessa janela (data ainda distante): não alerta.

**Como aparece:** um **aviso central na tela** (mesmo estilo visual do "aviso" central que já existe no app — `showWarningToast`/modal central), exibido **logo após o login** (depois que o overlay de login some) e também ao entrar na aba Kanban. Se houver vários, lista todos (ex.: "Você tem 2 a fazer: …"). Tem botão de fechar/OK. Como o lembrete é o próprio interruptor de "não me avise", **não** há "não mostrar de novo" — para parar de ver, desliga o interruptor daquele card.

**Escopo de quem vê:** como o Kanban é **admin-only**, os alertas de lembrete também são só para o admin.

**Regras de derivação (funções puras, testáveis):**
- `reminderState(card, hojeStr, antecedenciaDias=3)` → `"atrasado" | "chegando" | "nenhum"` (retorna `"nenhum"` se `!lembrete.ativo` ou sem data).
- `collectDueReminders(eventCards, hojeStr)` → lista de `{ groupId, eventName, estado }` para os que estão `atrasado`/`chegando`.

## Componentes (resumo)

| Unidade | O que faz | Depende de |
|---|---|---|
| `event_cards` (SQL) + RLS admin | Persistência compartilhada | `is_admin` |
| `loadEventCardsFromSupabase()` | Carrega no login | sbClient, appState |
| `getEventCard` / `saveEventCard` | Ler/gravar 1 card | appState.eventCards |
| `DEFAULT_CHECKLIST` | Template de 7 etapas | — |
| `ensureCardsForEvents()` | Auto-criação + backfill | appState.events, saveEventCard |
| `renderKanban()` | Monta o quadro a partir de eventCards | appState.events/eventCards |
| `openEventCardModal(groupId)` | Editor completo + checklist + lembrete (liga/desliga) | dropdowns/edição de evento existentes |
| `reminderState` / `collectDueReminders` | Derivam atrasado/chegando (puro) | — |
| `showDueReminders()` | Mostra o aviso central no login/abertura do Kanban | `collectDueReminders`, aviso central existente |
| `supabase_kanban_setup.sql` | Tabela + RLS admin | profiles/is_admin |
| Esconder nav p/ não-admin | `applyRoleUIChanges` | — |

## Casos de borda

- **Evento sem `group_id`** (registros antigos): usar a mesma chave de fallback da tabela de eventos (`event|date|venue|estado`). O card usa essa chave como `group_id`.
- **Excluir o último artista do grupo** dentro do card: igual ao comportamento atual da tabela (o grupo some) → também remove o card.
- **Checklist vazia:** barra de progresso mostra `0/0` (ou esconde a barra).
- **Conflito de edição** (admin em 2 lugares): última escrita vence (upsert); aceitável para uso admin único.
- **Acesso:** nav escondido para não-admin; mesmo que forcem a navegação, RLS admin-only impede leitura/gravação de `event_cards`. (Os dados de `events` continuam protegidos pela RLS própria deles.)

## Fora de escopo (YAGNI)

- Acesso de booker/logística ao Kanban (decidido: só admin por enquanto).
- Colunas customizáveis / novas colunas.
- Anexos, comentários, responsáveis por etapa.
- Notificações por e-mail/push (o lembrete é só o aviso central no app).
- Vigília contínua durante a sessão: os lembretes são avaliados **no login e ao abrir o Kanban**, não por um relógio rodando o tempo todo.
- Antecedência configurável por card (fica fixa em 3 dias por enquanto).
- Histórico de alterações.

## Testes

- `getEventCard` / progresso da checklist (contagem feitos/total): funções puras → Jest em `__tests__/app.test.js`.
- `DEFAULT_CHECKLIST` tem 7 itens, todos `feito:false`.
- `reminderState`: `"atrasado"` quando data < hoje; `"chegando"` quando hoje ≤ data ≤ hoje+3; `"nenhum"` quando desligado, sem data, ou data distante. `collectDueReminders` retorna só os ligados em estado atrasado/chegando.
- Verificação no navegador (webapp-testing): injetar eventos + cards, `renderKanban()` mostra cards/progresso; abrir o modal, marcar etapa e ver o progresso salvar; o interruptor do lembrete liga/desliga; o aviso central aparece no login para lembretes ligados (atrasado/chegando) e não aparece para desligados; auto-criação ao criar evento; nav escondido para não-admin.
- RLS de `event_cards`: teste de fora (REST) confirmando que anônimo/não-admin recebe `[]` / 401.
