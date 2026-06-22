# Design — Módulo de Gestão de Logística (StartBookings)

**Data:** 2026-06-11
**Status:** Aprovado pelo usuário (aguardando revisão da spec)

## 1. Objetivo

Módulo centralizado de logística de viagens dos artistas (ida/volta + estadia), com um
cargo dedicado de acesso restrito, dashboard operacional, alertas de prazo, criação em
cascata com salvamento parcial, gestão de grupos (rota compartilhada), indicadores por
artista na tabela de eventos e exportação do roteiro em PDF. **Sem uploads**: tudo texto.

## 2. Decisões tomadas (brainstorming)

1. **Financeiro:** o cargo Logística **não** vê dados financeiros. Acesso aos eventos só via
   uma função segura que devolve colunas não-financeiras.
2. **Acesso mínimo:** a Logística **não acessa a tela "Tabela de Eventos"** (nem seus dados
   completos/financeiros). Ela vê **apenas** um seletor mínimo de eventos ativos (nome, data,
   local, estado, artistas escalados) dentro da própria aba de Logística, só para criar/preencher
   a logística — nada além disso.
3. **PDF:** geração por **impressão estilizada** (`@media print` + `window.print()`), sem
   bibliotecas externas. O usuário escolhe "Salvar como PDF".
4. **Conclusão:** status vira **Concluída** por ação manual ("Finalizar Logística"); rascunho
   fica **Em Andamento** ("Salvar Rascunho").
5. **Faseamento:** entregue em **2 fases** (ver §11).

## 3. Cargo "Logística" e Segurança

### 3.1 Papel no `profiles`
- Estender o `check` de `profiles.role` para aceitar `'Logistica'` (além de `Admin`/`Artista`).
- Mapa `logistics_emails (email text primary key)` controlado pelo admin (espelha
  `artist_emails`). O trigger `handle_new_user` e o backfill passam a marcar `role='Logistica'`
  para e-mails desse mapa (precedência: Admin por e-mail/allowlist > Logistica por mapa >
  Artista padrão).
- Função `public.is_logistics()` → `true` se `profiles.role = 'Logistica'` para `auth.uid()`.

### 3.2 Eventos sem financeiro (função segura)
- Função `public.logistics_events()` (`security definer`, `search_path=''`) que retorna, **só**
  se `is_admin() OR is_logistics()`, as colunas **não-financeiras** dos eventos:
  `group_id, event_name, event_date, venue, estado, artist`. **Nunca** retorna `amount`,
  `amount_received`, `finance_notes`.
- A UI da Logística consome via `sbClient.rpc('logistics_events')`. A tabela `events` continua
  com RLS atual (admin + próprio artista); a Logística **não** lê `events` diretamente.

### 3.3 Tabela `logistics` e RLS
```
public.logistics (
  id          text primary key,        -- 'log-<timestamp><rand>'
  event_key   text not null,           -- = events.group_id do evento
  event_date  date,                    -- desnormalizado p/ alerta de prazo e ordenação
  artist      text not null,
  group_id    text,                    -- liga artistas com a MESMA rota
  status      text not null default 'andamento'  -- 'andamento' | 'concluida'
              check (status in ('andamento','concluida')),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
)
```
- RLS: `enable row level security`; políticas `to authenticated` permitindo **Admin OU
  Logística** em select/insert/update/delete (`using/with check ( is_admin() or is_logistics() )`).
- "Pendente" **não** é uma linha em `logistics`: é um (evento, artista) escalado que **não tem**
  linha. Logo o status efetivo por artista é: sem linha → `pendente`; com linha → o `status`.

### 3.4 UI por papel
- `applyRoleUIChanges` ganha o caso Logística: adiciona `body.role-logistica`.
- CSS: com `body.role-logistica`, esconder TODOS os itens de menu/seções exceto **Logística**
  (Dashboard de Logística). Em especial, a **"Tabela de Eventos"** fica oculta/bloqueada para a
  Logística. Admin vê Logística + todo o resto.
- A Logística **só obtém eventos** pela função `logistics_events()` (seletor mínimo na cascata);
  jamais pela tela/tabela de eventos nem pela tabela `events` direta.

### 3.5 Estrutura do JSONB `data`
```jsonc
{
  "hotel":   { "nome":"", "endereco":"", "checkin":"", "checkout":"" },
  "ida":     { "modo":"carro|uber|aviao", ...campos do modo... },
  "volta":   { "modo":"carro|uber|aviao", ...campos do modo... }
}
```
Campos por modo (em `ida`/`volta`):
- **carro** (Carro próprio/BlaBlaCar): `saida, chegada, pontoEncontro, motoristaNome, carroModelo, placa`.
- **uber** (Uber/Táxi): `saida, chegada, origem, destino`.
- **aviao**: `companhia, voo, localizador, partida, chegada, recepcaoNome, veiculoApoio`,
  e `conexoes: [{ cidade, espera, pernoite:bool, hotelNome, hotelEndereco, translado }]`.

## 4. Navegação e Dashboard de Logística

- Item de menu **"Logística"** (`id="nav-logistica-item"`), visível para Admin e Logística.
- Seção `#logistics-view` com:
  - **3 cartões (KPI):** Pendentes, Em Andamento, Concluídas (contagem por artista escalado).
  - **Alerta de prazo crítico:** lista/realce vermelho (classe `.deadline-alert` com animação
    de pulso) dos eventos com `event_date <= hoje+7` que tenham artista `pendente`/`andamento`.
  - **Botão "Criar nova logística"** e a lista das logísticas existentes (agrupadas por evento),
    cada artista com seu status e ações (Editar / Desmembrar).

## 5. Fluxo de Criação (cascata)

1. "Criar nova logística" → modal etapa 1: **Selecionar Evento** (somente eventos **ativos** =
   `event_date >= hoje`, obtidos via `logistics_events()`).
2. Etapa 2: **Selecionar Artistas** do evento (checkboxes; os marcados juntos compartilham
   `group_id` e os mesmos `data`).
3. Etapa 3: **Formulário** (§6). Botões: **Salvar Rascunho** (status `andamento`) e
   **Finalizar Logística** (status `concluida`).
4. **Desmembrar:** ação que atribui um `group_id` novo só àquele artista (passa a editar isolado);
   não altera os demais do grupo.

## 6. Formulário (Estadia + Trajetos espelhados)

- **Hospedagem principal:** `nome, endereço, check-in (data+hora), check-out (data+hora)`.
- **Ida** e **Volta** (mesma estrutura): seletor de **modo** (Carro/BlaBlaCar, Uber/Táxi, Avião)
  que revela os campos do modo (§3.5). Avião inclui **conexões** (adicionar/remover N conexões,
  cada uma com cidade, tempo de espera, pernoite com hotel+endereço+translado) e **desembarque
  local** (responsável pela recepção + veículo de apoio).
- Todos os campos são texto/seleção; nenhum exige anexo.

## 7. Indicadores na Tabela de Eventos (Admin)

Na tabela de eventos, para cada linha de artista, exibir o **status logístico**:
- `pendente` → texto **"Logística Pendente"** (sem clique).
- `andamento` → texto **"Logística em Andamento"** em **amarelo**.
- `concluida` → botão **"Ver Logística"** (só aparece nesse caso).

> Implementação: ao renderizar a tabela, cruzar cada (artista, group_id do evento) com
> `appState.logistics` para obter o status. Visível para Admin (a tabela de eventos é admin).

## 8. Modal "Ver Logística" (read-only) + PDF

- Abre um modal **somente leitura** com o dossiê (hospedagem, ida, volta, voos, conexões).
- **Não fecha ao clicar fora**; fecha apenas no **X** ou no botão **Fechar**.
- Botão **"Exportar PDF"**: monta uma área de impressão limpa (cabeçalho com artista/evento/data
  e seções do roteiro) e chama `window.print()` via uma folha `@media print` dedicada (oculta o
  resto da página na impressão). O usuário salva como PDF.

## 9. Camada de aplicação (app-v2.js)

- Estado: `appState.logistics` (array, cache em `localStorage` `sb_logistics`), carregado no
  login via `loadLogisticsFromSupabase()` (Admin/Logística).
- Eventos para a Logística: `loadLogisticsEvents()` via `sbClient.rpc('logistics_events')`,
  guardado em `appState.logisticsEvents` (usado no dashboard e na cascata).
- Funções: `renderLogisticsDashboard()`, `initLogisticsModule()`, `openLogisticsForm()`,
  `saveLogistics(record, finalize)`, `splitLogistics(id)`, `getArtistLogisticsStatus(groupId, artist)`,
  `openLogisticsViewModal(id)`, `printLogistics(id)`.
- Bump da versão de `app-v2.js?v=` e `style.css?v=` ao final.

## 10. Segurança e validação

- Todo conteúdo dinâmico inserido via `innerHTML` passa por `escapeHtml` (anti-XSS).
- Financeiro protegido no banco: Logística nunca recebe colunas de dinheiro.
- RLS real em `logistics`; ocultação de UI é só conveniência.

## 11. Faseamento

**Fase 1 — Base operacional**
- Banco: papel `Logistica`, `logistics_emails`, `is_logistics()`, `logistics_events()`, tabela
  `logistics` + RLS (script `supabase_logistica_setup.sql`).
- App: papel/role-logistica na UI, menu+seção Logística, dashboard (KPIs + alerta de prazo),
  fluxo de criação em cascata, formulário completo, salvar rascunho/finalizar, desmembrar,
  indicadores de status na tabela de eventos.

**Fase 2 — Consulta e PDF**
- Modal "Ver Logística" read-only (não fecha fora) + botão "Exportar PDF" (impressão).

## 12. Fora de escopo (YAGNI)

- Upload de arquivos/anexos.
- Logística visível para o cargo Artista.
- Edição de campos financeiros pela Logística (nunca acessível).
- Notificações/e-mail automáticos de prazo (o alerta é visual no painel).

## 13. Entregáveis

1. `supabase_logistica_setup.sql` (rodar uma vez).
2. `index.html` (menu, `#logistics-view`, modais de criação/formulário e de visualização).
3. `app-v2.js` (estado, loads, dashboard, fluxo, status na tabela, modal+print).
4. `style.css` (dashboard, alerta de prazo, formulário, modal, `@media print`, `role-logistica`).

## 14. Critérios de aceite

**Fase 1**
- [ ] Rodar o SQL cria o papel/funções/tabela e o mapa `logistics_emails`.
- [ ] Usuário Logística enxerga só "Logística"; Admin vê tudo.
- [ ] `logistics_events()` devolve eventos **sem** colunas financeiras; sem login → erro/sem dados.
- [ ] Dashboard mostra Pendentes/Em Andamento/Concluídas corretos e o alerta de ≤7 dias.
- [ ] Criar logística em cascata (evento → artistas), salvar rascunho e finalizar funciona.
- [ ] Desmembrar isola o artista sem afetar o grupo.
- [ ] Tabela de eventos mostra o status logístico por artista.

**Fase 2**
- [ ] "Ver Logística" abre modal read-only que não fecha ao clicar fora (só X/Fechar).
- [ ] "Exportar PDF" gera uma página limpa e imprimível do roteiro.
