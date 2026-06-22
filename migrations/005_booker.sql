-- =====================================================================
--  StartBookings — Booker como papel real + RLS de edição própria
--  Requer supabase_profiles_setup.sql já rodado (is_admin etc.).
--  SQL Editor → New query → cole tudo → Run. Idempotente.
--
--  O QUE FAZ
--   • Booker vira papel REAL em profiles (não só cosmético no front).
--   • Booker passa a LER e EDITAR só os shows que ELE vendeu (vendedor).
--   • Booker NÃO vê shows de outros bookers e NÃO pode excluir.
-- =====================================================================

-- 1) Papel 'Booker' aceito em profiles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin','Artista','Logistica','Booker'));

-- 2) Mapa e-mail -> nome do booker (controlado pelo admin)
create table if not exists public.booker_emails (
  email text primary key,
  booker_name text not null
);
alter table public.booker_emails enable row level security;
drop policy if exists "booker_emails_admin_all" on public.booker_emails;
create policy "booker_emails_admin_all" on public.booker_emails
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- 3) Nome do booker logado, lido de profiles (SECURITY INVOKER)
--    (reutiliza a coluna artist_name de profiles para guardar o nome do booker)
create or replace function public.current_booker_name()
returns text language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select p.artist_name from public.profiles p
      where p.id = auth.uid() and p.role = 'Booker'), '')
$$;

-- 4) Trigger de signup: marca 'Booker' pelo mapa e grava o nome
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_role   text := 'Artista';
  v_name   text;
begin
  if lower(coalesce(new.email,'')) in ('admin@startbookings.com','startbookings@gmail.com') then
    v_role := 'Admin';
  elsif exists (select 1 from public.logistics_emails le where lower(le.email)=lower(coalesce(new.email,''))) then
    v_role := 'Logistica';
  elsif exists (select 1 from public.booker_emails be where lower(be.email)=lower(coalesce(new.email,''))) then
    v_role := 'Booker';
    select be.booker_name into v_name from public.booker_emails be where lower(be.email)=lower(coalesce(new.email,''));
  end if;

  if v_name is null then
    select ae.artist_name into v_name from public.artist_emails ae where lower(ae.email)=lower(coalesce(new.email,''));
  end if;

  insert into public.profiles (id, email, role, artist_name)
  values (new.id, lower(coalesce(new.email,'')), v_role, v_name)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- 5) Backfill p/ bookers já existentes
update public.profiles p
  set role='Booker', artist_name=be.booker_name
  from public.booker_emails be
  where lower(p.email)=lower(be.email) and p.role <> 'Admin';

-- 6) Policies de events: booker lê e edita só os shows que vendeu
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname='public' and tablename='events' loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

create policy "events_select" on public.events
  for select to authenticated
  using (
    (select public.is_admin())
    or artist = (select public.current_artist_profile())
    or vendedor = (select public.current_booker_name())
  );

create policy "events_insert" on public.events
  for insert to authenticated
  with check ( (select public.is_admin()) );

create policy "events_update" on public.events
  for update to authenticated
  using ( (select public.is_admin()) or vendedor = (select public.current_booker_name()) )
  with check ( (select public.is_admin()) or vendedor = (select public.current_booker_name()) );

create policy "events_delete" on public.events
  for delete to authenticated
  using ( (select public.is_admin()) );

-- 7) >>> PREENCHA os bookers (admin) <<<
--    e-mail -> nome EXATAMENTE como aparece na coluna `vendedor` de events.
insert into public.booker_emails (email, booker_name) values
  ('rayannecaldas@gmail.com', 'Rayanne'),
  ('mheloisasoaresth@gmail.com', 'Heloísa')
on conflict (email) do update set booker_name = excluded.booker_name;

update public.profiles p set role='Booker', artist_name=be.booker_name
  from public.booker_emails be
  where lower(p.email)=lower(be.email) and p.role <> 'Admin';

-- 8) Conferência
select policyname, cmd from pg_policies where schemaname='public' and tablename='events' order by policyname;
select id, email, role, artist_name from public.profiles order by role;
