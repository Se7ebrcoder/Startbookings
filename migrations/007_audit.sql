-- =====================================================================
--  StartBookings — AUDITORIA (audit_logs + login_logs)
--  Requer supabase_profiles_setup.sql já rodado (usa public.is_admin()).
--  SQL Editor → New query → cole tudo → Run. IDEMPOTENTE (pode rodar de novo).
--
--  O QUE FAZ
--   • audit_logs : registra AUTOMATICAMENTE toda criação/edição/exclusão das
--     tabelas-chave (events, clients, logistics, event_cards, profiles) via
--     TRIGGERS no banco. Como é feito no servidor, o cliente NÃO consegue
--     burlar nem falsificar. Guarda quem fez (e-mail), quando, e o valor
--     antigo → novo (jsonb).
--   • login_logs : registra logins bem-sucedidos (gravado pelo app no login).
--   • RLS: só ADMIN lê. Ninguém edita/apaga pela API (logs IMUTÁVEIS).
--
--  COMO CONSULTAR (exemplos no fim do arquivo).
-- =====================================================================

-- =====================================================================
-- 1) TABELA audit_logs
-- =====================================================================
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  changed_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  table_name  text not null,
  operation   text not null check (operation in ('INSERT','UPDATE','DELETE')),
  row_id      text,
  old_data    jsonb,
  new_data    jsonb
);

create index if not exists audit_logs_changed_at_idx on public.audit_logs (changed_at desc);
create index if not exists audit_logs_table_idx      on public.audit_logs (table_name, changed_at desc);
create index if not exists audit_logs_actor_idx      on public.audit_logs (actor_email);

-- =====================================================================
-- 2) FUNÇÃO de trigger (SECURITY DEFINER -> ignora RLS para inserir o log).
--    search_path travado: tudo é schema-qualificado.
-- =====================================================================
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_row_id text;
begin
  if (TG_OP = 'DELETE') then
    v_old := to_jsonb(OLD);
  elsif (TG_OP = 'UPDATE') then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else  -- INSERT
    v_new := to_jsonb(NEW);
  end if;

  -- Identificador legível da linha (id, group_id ou email, conforme a tabela)
  v_row_id := coalesce(
    coalesce(v_new, v_old) ->> 'id',
    coalesce(v_new, v_old) ->> 'group_id',
    coalesce(v_new, v_old) ->> 'email'
  );

  -- Evita RUÍDO: ignora updates de profiles que só mexem no session_token
  -- (acontece a cada login/refresh de sessão e não é uma ação auditável).
  if (TG_OP = 'UPDATE' and TG_TABLE_NAME = 'profiles') then
    if ((v_old - 'session_token') is not distinct from (v_new - 'session_token')) then
      return NEW;
    end if;
  end if;

  insert into public.audit_logs(
    actor_id, actor_email, table_name, operation, row_id, old_data, new_data)
  values (
    auth.uid(),
    lower(coalesce(auth.jwt() ->> 'email', '')),
    TG_TABLE_NAME,
    TG_OP,
    v_row_id,
    v_old,
    v_new
  );

  if (TG_OP = 'DELETE') then return OLD; else return NEW; end if;
end;
$$;

-- =====================================================================
-- 3) ANEXA os triggers nas tabelas-chave (idempotente)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['events','clients','logistics','event_cards','profiles']
  loop
    -- só cria se a tabela existir (evita erro se algum módulo não foi instalado)
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
      execute format(
        'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I '
        || 'for each row execute function public.fn_audit()', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- 4) RLS de audit_logs — só admin lê; ninguém edita/apaga (imutável).
--    O trigger é SECURITY DEFINER, então insere mesmo sem policy de insert.
-- =====================================================================
alter table public.audit_logs enable row level security;
grant select on public.audit_logs to authenticated;

drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs
  for select to authenticated
  using ( (select public.is_admin()) );
-- (sem policy de INSERT/UPDATE/DELETE => bloqueado para usuários via API)

-- =====================================================================
-- 5) TABELA login_logs (gravada pelo app no login bem-sucedido)
-- =====================================================================
create table if not exists public.login_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  email      text,
  logged_at  timestamptz not null default now(),
  user_agent text
);
create index if not exists login_logs_logged_at_idx on public.login_logs (logged_at desc);

alter table public.login_logs enable row level security;
grant select, insert on public.login_logs to authenticated;

drop policy if exists "login_insert_own"   on public.login_logs;
drop policy if exists "login_select_admin" on public.login_logs;

-- cada usuário só insere a PRÓPRIA linha
create policy "login_insert_own" on public.login_logs
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );

-- só admin lê
create policy "login_select_admin" on public.login_logs
  for select to authenticated
  using ( (select public.is_admin()) );
-- (sem UPDATE/DELETE => imutável)

-- =====================================================================
-- 6) CONFERÊNCIAS / CONSULTAS DE EXEMPLO
-- =====================================================================
-- 6a) Triggers criados (deve listar trg_audit_* por tabela existente)
select event_object_table as tabela, trigger_name
from information_schema.triggers
where trigger_name like 'trg_audit_%'
order by tabela;

-- 6b) Últimas 50 ações (use no dia a dia)
-- select changed_at, actor_email, table_name, operation, row_id
-- from public.audit_logs order by changed_at desc limit 50;

-- 6c) O que mudou num UPDATE específico (campos alterados)
-- select key as campo, old_data->>key as de, new_data->>key as para
-- from public.audit_logs, jsonb_object_keys(new_data) as key
-- where id = <ID_DO_LOG> and old_data->>key is distinct from new_data->>key;

-- 6d) Últimos logins
-- select logged_at, email, user_agent from public.login_logs
-- order by logged_at desc limit 50;
