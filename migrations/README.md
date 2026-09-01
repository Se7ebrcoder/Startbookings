# Migrations — StartBookings (Supabase / PostgreSQL)

Scripts de banco **numerados e na ordem correta de aplicação**. Antes ficavam
soltos na raiz do projeto; aqui estão organizados para que dê para **recriar o
banco do zero** num projeto Supabase novo, com segurança.

> ⚠️ **No banco que já está no ar, isto NÃO precisa ser re-rodado.** Todos estes
> scripts já foram aplicados na produção atual. Esta pasta serve para
> **reprodutibilidade** (montar um ambiente novo / staging) e como **histórico
> versionado** do schema.

## Como aplicar (projeto NOVO, do zero)

Supabase → **SQL Editor** → New query → cole o conteúdo de cada arquivo e rode
**na ordem numérica**. Todos são **idempotentes** (`create ... if not exists`,
`create or replace`, `drop policy if exists`), então rodar de novo não quebra.

| Ordem | Arquivo | O que cria | Depende de |
|---|---|---|---|
| 001 | `001_profiles_and_rls.sql` | `profiles`, `artist_emails`, funções `is_admin`/`current_user_email`/`current_artist_profile`, trigger `handle_new_user` (v1), **RLS de `events`** | — |
| 002 | `002_add_session_token.sql` | coluna `session_token` em `profiles` (sessão única) | 001 |
| 003 | `003_clients.sql` | `clients` + colunas `client_id`/`contract_status` em `events` | 001 |
| 004 | `004_logistica.sql` | `logistics_emails`, `logistics`, `is_logistics`, `logistics_events()` (RPC), `handle_new_user` (v2: +Logística), CHECK de role → +`Logistica` | 001 |
| 005 | `005_booker.sql` | `booker_emails`, `current_booker_name`, `handle_new_user` (v3: **final**, +Booker), RLS de `events` **final** (com `vendedor`), CHECK de role → +`Booker` | 001, 004 |
| 006 | `006_kanban.sql` | `event_cards` (Kanban) | 001 |
| 007 | `007_audit.sql` | `audit_logs` (triggers), `login_logs` (auditoria) | 001 |
| 008 | `008_sessao_unica_e_hardening.sql` | `user_sessions` (sessão única) + hardening | 001 |
| 009 | `009_resolve_login.sql` | RPC `resolve_login_email` (login por nome sem expor PII) | 001, 005 |
| 010 | `010_roster_e_settings.sql` | `roster` (elenco/equipe + cor) e `goals` (metas); backfill a partir de events/emails | 001, 005 |
| 011 | `011_preenche_mapas_e_admin.sql` | garante os 8 artistas em `artist_emails` (faltavam 2) + bookers + roster; opcionalmente Cassia como admin real | 001, 005, 010 |
| 012 | `012_cassia_admin.sql` | adiciona `cassiac.gouveia@gmail.com` à allowlist de admin em `is_admin()` e no trigger de signup (funciona tendo conta ou não) | 001, 005 |
| 013 | `013_corrige_rls_string_vazia.sql` | **correção crítica**: RLS de `events` casava `'' = ''`; restringe também `goals` e `roster` | 001, 005, 010 |
| 014 | `014_remove_resolve_login_email.sql` | remove a RPC de login por nome (expunha e-mails a anônimos). **Rodar DEPOIS do deploy do frontend** | 009 |
| 015 | `015_lgpd_minimizacao_e_retencao.sql` | audit_logs passa a gravar só o delta e redige campos sensíveis; expurgo de audit (24m) e login (6m); login_logs gravado por RPC | 007 |
| 016 | `016_lgpd_retencao_logistica.sql` | mascara o localizador em D+2 e anonimiza o roteiro em D+90, preservando os valores do Financeiro | 004 |
| 017 | `017_lgpd_direitos_do_titular.sql` | `exportar_dados_titular()`, `anonimizar_titular()` e tabela de registro de solicitações (Art. 18) | 001, 004, 005, 010 |
| 018 | `018_agenda_expurgos_pg_cron.sql` | agenda os 4 expurgos no pg_cron. **Rodar DEPOIS de habilitar a extensão** — as 015/016 só agendam se ela já existir | 015, 016, pg_cron |
| 019 | `019_cadastro_por_allowlist.sql` | autocadastro segue ligado, mas só aceita e-mails já vinculados (artist/booker/logistics/allowlist). Cria `signup_allowlist` | 001, 004, 005, 012 |

> 🟢 **015 a 017 são de conformidade LGPD** (parecer de 30/08/2026). Nenhuma delas apaga
> dados ao ser executada: criam funções e agendamentos. A 015 **exige o deploy do frontend
> junto**, porque muda a gravação de `login_logs` para RPC.

> ✅ **Status em 30/08/2026:** as migrações 001–014 já estão **aplicadas em produção**.
> As **015, 016 e 017 (LGPD) ainda NÃO foram rodadas** — ver plano abaixo.

### Utilitário (rodar só quando precisar)

| Arquivo | Para quê |
|---|---|
| `090_util_limpar_mocks.sql` | Limpa dados de exemplo/mocks antigos. **Não** é parte do schema; rode manualmente se um banco novo vier com dados de teste. |

## Por que a ordem importa

- O trigger **`handle_new_user`** é redefinido 3 vezes (001 → 004 → 005),
  cada uma adicionando um papel. A versão **final e correta** é a do **005**,
  então 004 precisa vir antes de 005.
- O **CHECK de `role`** em `profiles` é expandido em etapas:
  `001` (Admin/Artista) → `004` (+Logistica) → `005` (+Booker). Aplicar fora de
  ordem faria um INSERT de papel novo violar o CHECK antigo.
- O **RLS de `events`** é (re)definido em 001 e novamente em 005 (adiciona o
  acesso do Booker pelo campo `vendedor`). A versão final é a do 005.
- `005` consulta `logistics_emails` (criada em 004), `booker_emails` (criada
  nele) e `artist_emails` (criada em 001).

## `_obsoletos/` — NÃO rodar

`supabase_rls.sql`, `supabase_rls_fix.sql`, `supabase_rls_hardening.sql` foram
as primeiras versões do RLS. Estão **substituídas pelo `001_profiles_and_rls.sql`**
(que resolveu o escalonamento de admin lendo papel de `profiles`, não de
`user_metadata`). Ficam aqui só como histórico — **não aplique**.

## Depois de aplicar (passos manuais do admin)

1. **001/005:** preencher os mapas e-mail→nome — `artist_emails`,
   `booker_emails`, `logistics_emails` — para os papéis resolverem no login.
2. **007:** nada a fazer; os triggers passam a gravar sozinhos. Consultas de
   exemplo estão no fim do próprio arquivo.
3. Conferir no painel: **Confirm email** ligado, **Anonymous sign-ins** desligado,
   `service_role` rotacionada.
4. **010:** nada a preencher. No primeiro login do admin após rodar, o front faz
   um **backfill automático** (uma vez por navegador) subindo para `roster`/`goals`
   os artistas/vendedores/cores/metas que ainda estejam no `localStorage` do admin.
   A própria migração também já semeia `roster` a partir de `events`,
   `artist_emails` e `booker_emails`.
