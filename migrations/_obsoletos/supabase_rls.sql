-- =====================================================================
--  StartBookings — Row Level Security (RLS) para a tabela `events`
-- ---------------------------------------------------------------------
--  COMO USAR:
--  1. Abra o Supabase → SQL Editor → New query
--  2. Cole TODO este arquivo e clique em "Run"
--  3. Pronto: a partir daqui a segurança é garantida PELO BANCO,
--     e não mais apenas pelo JavaScript do navegador.
--
--  MODELO DE ACESSO:
--   • ADMIN  -> lê e escreve TODOS os eventos.
--   • ARTISTA -> lê (e edita) apenas os eventos onde `artist`
--                for igual ao seu próprio perfil de artista.
--
--  O app já grava no cadastro (signUp) os metadados do usuário:
--     { role: 'Admin' | 'Artista', artistProfile: '<nome do artista>' }
--  Estas policies leem esses metadados a partir do JWT.
-- =====================================================================

-- 1) Liga o RLS (sem isto, qualquer chave anon lê tudo!)
alter table public.events enable row level security;

-- 2) Funções auxiliares que leem o JWT do usuário logado -----------------

-- E-mail do usuário logado
create or replace function public.current_user_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- True se o usuário logado é Admin (por role nos metadados OU por e-mail)
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'Admin'
    or public.current_user_email() in (
      'admin@startbookings.com',
      'startbookings@gmail.com'
    )
$$;

-- Nome do perfil de artista do usuário logado
create or replace function public.current_artist_profile()
returns text language sql stable as $$
  select coalesce(
    auth.jwt() -> 'user_metadata' ->> 'artistProfile',
    auth.jwt() -> 'user_metadata' ->> 'name',
    ''
  )
$$;

-- 3) Remove policies antigas (se você rodar este script de novo) ---------
drop policy if exists "events_select" on public.events;
drop policy if exists "events_insert" on public.events;
drop policy if exists "events_update" on public.events;
drop policy if exists "events_delete" on public.events;

-- 4) Policies -----------------------------------------------------------

-- LEITURA: admin vê tudo; artista vê só os próprios shows
create policy "events_select" on public.events
  for select to authenticated
  using (
    public.is_admin()
    or artist = public.current_artist_profile()
  );

-- INSERÇÃO: somente admin cadastra eventos
create policy "events_insert" on public.events
  for insert to authenticated
  with check ( public.is_admin() );

-- ATUALIZAÇÃO: somente admin edita
create policy "events_update" on public.events
  for update to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- EXCLUSÃO: somente admin exclui
create policy "events_delete" on public.events
  for delete to authenticated
  using ( public.is_admin() );

-- =====================================================================
--  IMPORTANTE: depois de rodar isto, REVOGUE/ROTACIONE a chave
--  `service_role` antiga no painel (Settings → API), pois ela já
--  esteve exposta e IGNORA todas estas regras.
-- =====================================================================
