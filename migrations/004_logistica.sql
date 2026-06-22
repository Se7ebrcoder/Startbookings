-- =====================================================================
--  StartBookings — Setup do módulo de Logística (Fase 1)
--  Requer que supabase_profiles_setup.sql já tenha rodado (is_admin etc.).
--  SQL Editor → New query → cole tudo → Run. Idempotente.
-- =====================================================================

-- 1) Papel 'Logistica' aceito em profiles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin','Artista','Logistica'));

-- 2) Mapa e-mail -> cargo logística (controlado pelo admin)
create table if not exists public.logistics_emails (
  email text primary key
);
alter table public.logistics_emails enable row level security;
drop policy if exists "logistics_emails_admin_all" on public.logistics_emails;
create policy "logistics_emails_admin_all" on public.logistics_emails
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- 3) is_logistics(): papel do próprio usuário lido de profiles
create or replace function public.is_logistics()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select p.role = 'Logistica' from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- 4) Trigger de signup: agora também marca 'Logistica' pelo mapa
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role   text := 'Artista';
  v_artist text;
begin
  if lower(coalesce(new.email,'')) in ('admin@startbookings.com','startbookings@gmail.com') then
    v_role := 'Admin';
  elsif exists (select 1 from public.logistics_emails le where lower(le.email) = lower(coalesce(new.email,''))) then
    v_role := 'Logistica';
  end if;

  select ae.artist_name into v_artist
  from public.artist_emails ae
  where lower(ae.email) = lower(coalesce(new.email,''));

  insert into public.profiles (id, email, role, artist_name)
  values (new.id, lower(coalesce(new.email,'')), v_role, v_artist)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- 5) Backfill: aplica 'Logistica' a quem já existe e está no mapa
update public.profiles p
  set role = 'Logistica'
  from public.logistics_emails le
  where lower(p.email) = lower(le.email) and p.role <> 'Admin';

-- 6) Função segura de eventos p/ logística (SEM financeiro)
create or replace function public.logistics_events()
returns table (group_id text, event_name text, event_date text, venue text, estado text, artist text)
language sql stable security definer set search_path = ''
as $$
  select e.group_id, e.event_name, e.event_date, e.venue, e.estado, e.artist
  from public.events e
  where public.is_admin() or public.is_logistics()
$$;

-- 7) Tabela logistics + RLS (Admin OU Logística)
create table if not exists public.logistics (
  id          text primary key,
  event_key   text not null,
  event_date  text,
  artist      text not null,
  group_id    text,
  status      text not null default 'andamento' check (status in ('andamento','concluida')),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
alter table public.logistics enable row level security;
drop policy if exists "logistics_all" on public.logistics;
create policy "logistics_all" on public.logistics
  for all to authenticated
  using ( (select public.is_admin()) or (select public.is_logistics()) )
  with check ( (select public.is_admin()) or (select public.is_logistics()) );

-- 8) E-mails que terão o cargo Logística (idempotente)
insert into public.logistics_emails (email) values
  ('alinejanau17@gmail.com')  -- Aline
  on conflict (email) do nothing;
-- Aplica o cargo a quem já tem conta:
update public.profiles p set role='Logistica'
  from public.logistics_emails le
  where lower(p.email)=lower(le.email) and p.role <> 'Admin';

-- 9) Conferências
select policyname, cmd from pg_policies where schemaname='public' and tablename='logistics';
select id, email, role from public.profiles order by role;
