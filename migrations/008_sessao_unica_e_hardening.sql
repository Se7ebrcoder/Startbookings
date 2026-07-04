-- =====================================================================
--  StartBookings — 008: Sessão única funcional + hardening de auditoria
--  Requer 001 (profiles/RLS) e 007 (audit/login_logs) já rodados.
--  SQL Editor → New query → cole tudo → Run. IDEMPOTENTE (pode rodar de novo).
--
--  O QUE RESOLVE (achados da auditoria de 04/07/2026)
--   #1 Sessão única quebrada p/ não-admins: o update de profiles.session_token
--      era bloqueado pela RLS (update só admin) e falhava em silêncio.
--      -> Nova tabela user_sessions com RLS "dono da linha".
--   #4 audit_logs vazava session_token em old_data/new_data.
--      -> fn_audit passa a remover o campo (defesa extra mesmo após a migração).
--   #5 login_logs.email era texto livre do cliente (spoofável).
--      -> Trigger preenche email/user_id no servidor a partir do JWT.
--   #8 GRANT delete desnecessário em profiles. -> revogado.
-- =====================================================================

-- =====================================================================
-- 1) TABELA user_sessions (1 linha por usuário; cada um mexe só na sua)
-- =====================================================================
create table if not exists public.user_sessions (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  session_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.user_sessions enable row level security;
grant select, insert, update on public.user_sessions to authenticated;

drop policy if exists "sessions_own" on public.user_sessions;
create policy "sessions_own" on public.user_sessions
  for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- Migra tokens existentes (só admins tinham conseguido gravar)
insert into public.user_sessions (user_id, session_token)
select p.id, p.session_token
from public.profiles p
where p.session_token is not null
on conflict (user_id) do nothing;

-- =====================================================================
-- 2) fn_audit: nunca gravar session_token nos logs (defesa em profundidade)
--    (mesma função do 007, com o strip adicionado)
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

  -- Segurança: tokens de sessão NUNCA vão para o log de auditoria
  v_old := v_old - 'session_token';
  v_new := v_new - 'session_token';

  v_row_id := coalesce(
    coalesce(v_new, v_old) ->> 'id',
    coalesce(v_new, v_old) ->> 'group_id',
    coalesce(v_new, v_old) ->> 'email'
  );

  -- Evita RUÍDO: update de profiles que (após o strip) não mudou nada auditável
  if (TG_OP = 'UPDATE' and TG_TABLE_NAME = 'profiles') then
    if (v_old is not distinct from v_new) then
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
-- 3) login_logs: email e user_id definidos NO SERVIDOR (anti-spoofing)
-- =====================================================================
create or replace function public.fn_login_log_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.email   := lower(coalesce(auth.jwt() ->> 'email', ''));
  return new;
end;
$$;

drop trigger if exists trg_login_log_stamp on public.login_logs;
create trigger trg_login_log_stamp
  before insert on public.login_logs
  for each row execute function public.fn_login_log_stamp();

-- =====================================================================
-- 4) Defesa em profundidade: o app nunca deleta profiles pelo cliente
-- =====================================================================
revoke delete on public.profiles from authenticated;

-- =====================================================================
-- 5) LIMPEZA (rodar SÓ depois de publicar o front atualizado, que usa
--    user_sessions — senão o front antigo volta a gravar em profiles)
-- =====================================================================
-- alter table public.profiles drop column if exists session_token;

-- =====================================================================
-- 6) CONFERÊNCIAS
-- =====================================================================
-- 6a) Policy de user_sessions (1 linha: sessions_own / ALL)
select policyname, cmd from pg_policies
where schemaname='public' and tablename='user_sessions';

-- 6b) Trigger de login_logs criado
select trigger_name from information_schema.triggers
where trigger_name = 'trg_login_log_stamp';
