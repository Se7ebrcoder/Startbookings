-- =====================================================================
--  StartBookings — CORREÇÃO do RLS da tabela `events`
-- ---------------------------------------------------------------------
--  Use este script se, depois de rodar o supabase_rls.sql, o banco
--  AINDA devolver dados sem login. Causa provável: já existia uma
--  policy antiga (ex.: "liberar leitura para todos") que continuava
--  concedendo acesso. Aqui removemos TODAS as policies da tabela e
--  recriamos apenas as corretas.
--
--  COMO USAR: SQL Editor → New query → cole tudo → Run.
-- =====================================================================

-- 1) Garante o RLS ligado
alter table public.events enable row level security;

-- 2) Remove TODAS as policies existentes da tabela events (qualquer nome)
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'events'
  loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

-- 3) (Re)cria as funções auxiliares que leem o JWT do usuário logado
create or replace function public.current_user_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'Admin'
    or public.current_user_email() in (
      'admin@startbookings.com',
      'startbookings@gmail.com'
    )
$$;

create or replace function public.current_artist_profile()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'artistProfile',
    auth.jwt() -> 'user_metadata' ->> 'name',
    ''
  )
$$;

-- 4) Recria apenas as policies corretas (somente para usuários logados)
create policy "events_select" on public.events
  for select to authenticated
  using ( public.is_admin() or artist = public.current_artist_profile() );

create policy "events_insert" on public.events
  for insert to authenticated
  with check ( public.is_admin() );

create policy "events_update" on public.events
  for update to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

create policy "events_delete" on public.events
  for delete to authenticated
  using ( public.is_admin() );

-- 5) Conferência: lista o que ficou ativo (deve mostrar só as 4 acima,
--    todas com role = {authenticated})
select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'events'
order by policyname;
