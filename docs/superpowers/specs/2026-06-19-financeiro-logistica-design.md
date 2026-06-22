# Aba Financeiro — Valores de Logística (design)

> Data: 2026-06-19
> Feature 1 de 2 (a segunda, reformulação do Kanban, terá spec própria depois).

## Objetivo

Criar uma aba **Financeiro** (somente admin) onde se define o **valor em R$** da logística de cada artista em cada evento, de acordo com o modo de transporte já escolhido na aba Logística. Esses valores **somam ao total** do show na tabela de eventos (Modelo A) e recalculam o "A Receber".

## Decisões aprovadas pelo usuário

1. **Modelo A — logística soma ao total.** O cliente paga a logística por cima do cachê. `Total = Cachê + Logística`; `A Receber = Total − Recebido`.
2. **Itens com valor:** cada trecho de transporte (ida e volta) **e** a hospedagem. Total da logística = ida + volta + hospedagem.
3. **Divisão de responsabilidade:** o **modo** de transporte e os detalhes da viagem continuam sendo definidos na aba **Logística** (Aline/admin). A aba **Financeiro** (admin) só preenche os **valores em R$** no mesmo registro.
4. **Layout:** acordeão por evento (padrão do site), igual Clientes/Eventos.
5. **Tabela de eventos:** nova coluna **Logística** (automática) + **Total** automático. `Cachê` e `Recebido` continuam editáveis; `Logística`, `Total` e `A Receber` são calculados.
6. **Artista:** vê o Total já com a logística (só-leitura); **não** vê a aba Financeiro nem edita valores.
7. **Booker:** pode **editar** os eventos que ele vendeu e **não vê** os eventos de outros bookers. (Ver seção "Impacto de segurança".)
8. **Meta/Faturamento do painel:** continua contando **só o cachê** (logística é reembolso, não venda).

## Modelo de dados

Sem mudança de schema. Os valores ficam no mesmo `data` (JSONB) do registro `logistics`, que hoje é:

```js
data = {
  temHospedagem: bool,
  hotel: { nome, endereco, checkin, checkout } | null,
  ida:  { modo, saida, chegada, ... },
  volta:{ modo, saida, chegada, ... }
}
```

A aba Financeiro acrescenta, no mesmo objeto:
- `data.ida.valor`   → número (R$ do trecho de ida)
- `data.volta.valor` → número (R$ do trecho de volta)
- `data.hotel.valor` → número (R$ da hospedagem; só quando `temHospedagem`)

**Helper novo:** `getLogisticsCost(eventKey, artist)` → retorna `(ida.valor||0) + (volta.valor||0) + (hotel?.valor||0)`. Retorna `0` quando não há registro de logística.

Persistência: reaproveita `saveLogistics(record)` (já espelha localStorage + Supabase via upsert). Editar um valor no Financeiro = atualizar o `data` do registro e chamar `saveLogistics`.

## A aba Financeiro (UI)

- Novo item de menu **"Financeiro"**, escondido para Artista, Booker e Logística (mesma técnica de `applyRoleUIChanges` / classes de papel já usada nas outras abas).
- Nova seção `#financeiro-view`.
- `renderFinanceiroView()`: acordeão por evento (reaproveita o agrupamento por `group_id` já usado na tabela de eventos). Para cada evento, lista os artistas; para cada artista mostra os trechos com **rótulo conforme o modo** e um input de R$:

```
▾ Festival X — 12/07              Logística do evento: R$ 1.250
   • Se7e                                        R$ 950
       IDA    ✈ Passagem (avião)     R$ [ 450 ]
       VOLTA  ⛽ Gasolina (carro)     R$ [ 200 ]
       🏨 Hospedagem                  R$ [ 300 ]
   • Atomuz                                      R$ 300
       IDA    🚌 Passagem (ônibus)    R$ [ 150 ]
       VOLTA  🚌 Passagem (ônibus)    R$ [ 150 ]
```

- **Rótulo do valor conforme o modo** (mapa `COST_LABELS`):
  - `carro_proprio` → "Gasolina"
  - `carro` (BlaBlaCar) → "Passagem (BlaBlaCar)"
  - `uber` → "Uber"
  - `taxi` → "Táxi"
  - `aviao` → "Passagem (avião)"
  - `onibus` → "Passagem (ônibus)"
- Quando o artista **não tem modo definido** (sem registro de logística), aparece na lista com o aviso *"Defina a logística na aba Logística primeiro"* e **sem** campos de valor.
- Quando `temHospedagem` é falso, a linha de hospedagem não aparece.
- **Salvar automático** ao sair do campo (evento `change`/`blur`), igual à edição inline da tabela de eventos. Sem botão "salvar".
- Ao salvar, re-renderiza o total daquele evento no Financeiro e chama `renderEventTable()` para a tabela de eventos refletir na hora.
- Design segue os padrões do site (mesmas classes de acordeão, inputs e badges).

## Mudanças na tabela de eventos

Em `renderEventTable()`, na linha de cada show (admin):
- Mantém `Cachê` (o input `amount` de hoje, renomeado de "TOTAL" para "CACHÊ").
- Nova coluna **LOGÍSTICA** (só-leitura): `getLogisticsCost(eventKey, artist)`, formatada; em branco/`—` quando 0.
- Nova coluna **TOTAL** (só-leitura): `cachê + logística`.
- `RECEBIDO`: input editável (como hoje).
- `A RECEBER` (só-leitura): `total − recebido`.

Para **Artista** e **Booker** (visões só-leitura/limitadas): as mesmas colunas, com `Total` já incluindo a logística. A coluna Logística aparece como informação.

KPIs / dashboard: **sem mudança** — faturamento e meta continuam somando `amount` (cachê).

## Impacto de segurança (Booker editável)

Hoje a RLS de `events` permite **insert/update/delete só para admin**; o "Booker" é apenas cosmético no front (filtra por `vendedor` no cliente). Para o Booker **realmente** editar (e salvar) os próprios eventos:

1. **`profiles`**: incluir `'Booker'` no `check` de `role` (hoje aceita `Admin/Artista/Logistica`).
2. **Mapa de bookers**: tabela `booker_emails` (e-mail → nome do booker), análoga a `artist_emails`/`logistics_emails`, controlada pelo admin; o trigger `handle_new_user` passa a marcar `role='Booker'` para esses e-mails.
3. **Função** `current_booker_name()` (SECURITY INVOKER, lê de `profiles`) e/ou `is_booker()`.
4. **Policies de `events`**:
   - SELECT: admin tudo; artista pelos shows do seu artista; **booker só onde `vendedor = current_booker_name()`**.
   - UPDATE: admin tudo; **booker só onde `vendedor = current_booker_name()`** (com `using` + `with check`). **Booker não edita o campo de logística** (isso é do admin) — como logística vive na tabela `logistics` (RLS admin/logística), o booker naturalmente não grava lá.
5. Front: liberar a edição inline (cachê/recebido/status) para o papel Booker apenas nas linhas dele.

> Este bloco será um **script SQL próprio** (`supabase_booker_setup.sql`) + ajuste no front. Fica explícito no plano de implementação como uma etapa separada, para poder testar a RLS isoladamente (mesmo padrão dos outros módulos).

## Componentes (resumo)

| Unidade | O que faz | Depende de |
|---|---|---|
| `getLogisticsCost(eventKey, artist)` | Soma ida+volta+hospedagem de um registro | `getLogisticsRecord` |
| `COST_LABELS` | Mapa modo → rótulo do valor | — |
| `renderFinanceiroView()` | Acordeão por evento com inputs de R$ | `appState.events`, `appState.logistics`, `getLogisticsCost` |
| handler de input do Financeiro | Grava `data.{ida,volta,hotel}.valor` e re-renderiza | `getLogisticsRecord`, `saveLogistics`, `renderEventTable` |
| `renderEventTable()` (ajuste) | Colunas Cachê/Logística/Total/A Receber | `getLogisticsCost` |
| `supabase_booker_setup.sql` (etapa separada) | Booker como papel real + RLS de edição própria | `profiles`, `is_admin` |

## Casos de borda

- **Sem registro de logística** → custo 0; coluna Logística em branco; no Financeiro mostra aviso "defina a logística primeiro".
- **Modo `carro_proprio`/`uber`** (sem detalhes de viagem) → ainda assim tem campo de valor (gasolina/uber).
- **Hospedagem desmarcada** → sem linha de hospedagem; não soma.
- **Valor vazio/inválido** → tratado como 0 (`parseFloat || 0`).
- **Logística "desmembrada"** (split) → cada registro tem seu próprio valor; nada muda no cálculo (é por `eventKey+artist`).
- **Permissão**: a aba Financeiro nunca aparece para não-admin; mesmo que alguém force a navegação, a RLS de `logistics` impede gravação por quem não é admin/logística.

## Fora de escopo (YAGNI)

- Relatórios/exportação financeira consolidada.
- Histórico de alterações de valores.
- Moedas/câmbio.
- Reformulação do Kanban (feature 2, spec separada).

## Testes

- `getLogisticsCost`: soma correta (ida+volta+hospedagem), 0 sem registro, ignora valores vazios. (Jest, função pura — adicionar em `__tests__/app.test.js`.)
- `COST_LABELS`: rótulo certo por modo.
- Verificação manual no navegador (webapp-testing): editar valor no Financeiro reflete no Total da tabela de eventos; aba Financeiro escondida para não-admin.
- RLS do Booker: teste de fora (REST) confirmando que booker só lê/grava os próprios shows (na etapa do `supabase_booker_setup.sql`).
