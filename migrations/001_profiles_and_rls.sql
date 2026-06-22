-- =====================================================================
--  StartBookings — SEGURANÇA DEFINITIVA (profiles + RLS)  ✅ script único
-- ---------------------------------------------------------------------
--  Este script SUBSTITUI os anteriores (supabase_rls.sql,
--  supabase_rls_fix.sql, supabase_rls_hardening.sql). Rodar só ESTE.
--
--  O QUE ELE RESOLVE
--   1. Acesso público sem login  -> RLS ligado em `events`.
--   2. Escalonamento de admin     -> admin NÃO vem mais de user_metadata
--      (editável pelo usuário). Vem de e-mail verificado OU de uma tabela
--      `profiles` controlada pelo admin.
--   3. Artista lendo shows de outro -> o "perfil de artista" agora vem de
--      `profiles.artist_name` (definido pelo admin), e não de metadado
--      que o próprio usuário consegue editar.
--
--  COMO FUNCIONA
--   • `profiles`      : 1 linha por usuário (role + artista). Só admin edita.
--   • `artist_emails` : mapa e-mail -> nome do artista (admin gerencia).
--   • Trigger no signup: cria o profile automaticamente, decidindo o papel
--     pelo e-mail VERIFICADO e o artista pelo mapa `artist_emails`.
--   • É idempotente: pode rodar de novo sem quebrar nada.
--
--  COMO USAR: Supabase → SQL Editor → New query → cole tudo → Run.
--             Depois preencha o mapa de artistas (passo 9) e teste (passo 10).
-- =====================================================================

-- =====================================================================
-- 1) TABELA profiles  (fonte de verdade de papéis/artista)
-- =====================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  role        text not null default 'Artista' check (role in ('Admin','Artista')),
  artist_name text,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 2) TABELA artist_emails  (mapa e-mail -> artista, controlado pelo admin)
-- =====================================================================
create table if not exists public.artist_emails (
  email       text primary key,
  artist_name text not null
);

-- =====================================================================
-- 3) FUNÇÕES auxiliares
-- =====================================================================

-- E-mail VERIFICADO do usuário logado (claim do Supabase Auth; o cliente
-- não consegue forjar). search_path travado p/ hardening.
create or replace function public.current_user_email()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- É Admin? Por e-mail verificado na allowlist OU por app_metadata.role
-- (que só o backend/painel define). NUNCA por user_metadata.
-- Não lê a tabela profiles -> evita recursão de RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'Admin'
    or public.current_user_email() in (
      'admin@startbookings.com',
      'startbookings@gmail.com'
    )
$$;

-- Artista do usuário logado, lido da tabela profiles (definido pelo admin).
-- SECURITY INVOKER: roda como o próprio usuário e só enxerga a PRÓPRIA
-- linha (graças à policy "profiles_select_own" abaixo).
create or replace function public.current_artist_profile()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select p.artist_name from public.profiles p where p.id = auth.uid()),
    ''
  )
$$;

-- =====================================================================
-- 4) TRIGGER: cria o profile automaticamente quando um usuário se cadastra
--    SECURITY DEFINER porque roda no momento do signup (sem sessão do
--    usuário). Decide papel/artista por fontes CONFIÁVEIS, ignorando o
--    que o usuário tenha colocado em user_metadata.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   text := 'Artista';
  v_artist text;
begin
  -- Papel pelo e-mail VERIFICADO (não pelo que o usuário enviou no cadastro)
  if lower(coalesce(new.email, '')) in ('admin@startbookings.com','startbookings@gmail.com') then
    v_role := 'Admin';
  end if;

  -- Artista pelo mapa controlado pelo admin (não por metadado do usuário)
  select ae.artist_name into v_artist
  from public.artist_emails ae
  where lower(ae.email) = lower(coalesce(new.email, ''));

  insert into public.profiles (id, email, role, artist_name)
  values (new.id, lower(coalesce(new.email,'')), v_role, v_artist)
  on conflict (id) do update
    set email = excluded.email;  -- mantém role/artist já definidos pelo admin

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 5) BACKFILL: cria profiles p/ usuários que JÁ existem
-- =====================================================================
insert into public.profiles (id, email, role, artist_name)
select
  u.id,
  lower(coalesce(u.email,'')),
  case when lower(coalesce(u.email,'')) in
        ('admin@startbookings.com','startbookings@gmail.com')
       then 'Admin' else 'Artista' end,
  (select ae.artist_name from public.artist_emails ae
    where lower(ae.email) = lower(coalesce(u.email,'')))
from auth.users u
on conflict (id) do nothing;

-- =====================================================================
-- 6) RLS + GRANTS da tabela profiles
-- =====================================================================
alter table public.profiles enable row level security;

-- A função invoker precisa que o papel authenticated possa LER profiles
-- (a RLS abaixo limita às linhas certas).
grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated;

drop policy if exists "profiles_select_own"   on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

-- Cada um lê a PRÓPRIA linha (sem chamar função -> sem recursão)
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ( id = (select auth.uid()) );

-- Admin lê todas
create policy "profiles_select_admin" on public.profiles
  for select to authenticated
  using ( (select public.is_admin()) );

-- Só admin cria/edita/exclui perfis (impede o usuário mudar o próprio papel)
create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check ( (select public.is_admin()) );

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using ( (select public.is_admin()) );

-- =====================================================================
-- 7) RLS da tabela artist_emails  (só admin; o trigger usa SECURITY DEFINER
--    e ignora RLS, então não precisa de GRANT para authenticated/anon)
-- =====================================================================
alter table public.artist_emails enable row level security;

drop policy if exists "artist_emails_admin_all" on public.artist_emails;
create policy "artist_emails_admin_all" on public.artist_emails
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- =====================================================================
-- 8) RLS + policies da tabela events
-- =====================================================================
alter table public.events enable row level security;

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

-- LEITURA: admin vê tudo; artista vê só os shows do SEU artista (via profiles)
create policy "events_select" on public.events
  for select to authenticated
  using (
    (select public.is_admin())
    or artist = (select public.current_artist_profile())
  );

-- ESCRITA: só admin
create policy "events_insert" on public.events
  for insert to authenticated
  with check ( (select public.is_admin()) );

create policy "events_update" on public.events
  for update to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

create policy "events_delete" on public.events
  for delete to authenticated
  using ( (select public.is_admin()) );

-- =====================================================================
-- 9) >>> PREENCHA AQUI o mapa de artistas (você, admin) <<<
--    Para cada artista que loga, diga qual e-mail corresponde a qual
--    nome de artista EXATAMENTE como aparece na coluna `artist` de events.
--    Rode estes INSERTs (descomente e ajuste). É idempotente.
-- ---------------------------------------------------------------------
insert into public.artist_emails (email, artist_name) values
  ('contato.anotherreality@gmail.com', 'Another Reality'),
  ('parallelusmusic@gmail.com', 'Parallelus'),
  ('atomuz_@outlook.com', 'Atomuz'),
  ('contatoartisticope@gmail.com', 'Bug System'),
  ('giuseppebandini36@gmail.com', 'Bandini'),
  ('raianlameira@hotmail.com', 'Se7e')
on conflict (email) do update set artist_name = excluded.artist_name;

-- E, se o artista JÁ tinha conta, atualize o profile dele de uma vez:
update public.profiles p
  set artist_name = ae.artist_name
  from public.artist_emails ae
  where lower(p.email) = lower(ae.email);
-- =====================================================================

-- =====================================================================
-- 10) CONFERÊNCIAS (devem rodar sem erro)
-- =====================================================================
-- 10a) Policies ativas em events (4 linhas, role {authenticated})
select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'events'
order by policyname;

-- 10b) Profiles criados
select id, email, role, artist_name from public.profiles order by created_at;
