-- =====================================================================
--  StartBookings — RLS ENDURECIDO (corrige falha de escalonamento de admin)
-- ---------------------------------------------------------------------
--  POR QUE ESTE SCRIPT EXISTE:
--  As versões anteriores (supabase_rls.sql / supabase_rls_fix.sql) decidiam
--  quem é Admin lendo `user_metadata.role`. Isso é INSEGURO: no Supabase o
--  `user_metadata` (raw_user_meta_data) é EDITÁVEL pelo próprio usuário
--  logado, por ex. via:
--       await supabase.auth.updateUser({ data: { role: 'Admin' } })
--  Ou seja, qualquer artista conseguiria virar "Admin" e ler/editar/excluir
--  TODOS os eventos. (Regra oficial: nunca use user_metadata em autorização.)
--
--  O QUE MUDA AQUI:
--   • Admin passa a ser definido por:
--        (a) e-mail verificado na allowlist abaixo  → imutável pelo cliente
--        (b) app_metadata.role = 'Admin'            → só o backend/painel seta
--     Nunca mais por user_metadata.
--   • Funções com SECURITY INVOKER + search_path travado (hardening).
--   • Policies com (select ...) para o planner avaliar a função 1x (perf).
--
--  COMO USAR: Supabase → SQL Editor → New query → cole tudo → Run.
-- =====================================================================

-- 1) Garante o RLS ligado (sem isto, a tabela fica aberta na Data API)
alter table public.events enable row level security;

-- 2) Remove TODAS as policies existentes da tabela (qualquer nome antigo)
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

-- 3) Funções auxiliares (seguras) -------------------------------------
--    Observação: SECURITY INVOKER (padrão, mas explícito) e search_path
--    travado para evitar resolução de nomes maliciosa. Tudo é
--    schema-qualificado por causa do search_path vazio.

-- E-mail VERIFICADO do usuário logado (claim setado pelo Supabase Auth,
-- não editável pelo cliente).
create or replace function public.current_user_email()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- É Admin? Apenas por e-mail verificado OU por app_metadata (seguro).
-- >>> Para adicionar/remover admins, edite a lista de e-mails abaixo,
--     ou defina app_metadata.role = 'Admin' no painel (Authentication →
--     usuário → app_metadata) — isso o cliente NÃO consegue alterar.
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

-- Perfil de artista do usuário logado.
-- Preferimos app_metadata (seguro). O fallback para user_metadata mantém
-- os artistas atuais funcionando, MAS veja a NOTA DE SEGURANÇA no fim:
-- enquanto o perfil vier de user_metadata, um artista pode (apenas) LER
-- shows de outro artista mudando o próprio metadado. Inserir/editar/excluir
-- continua restrito a Admin, então não há adulteração de dados.
create or replace function public.current_artist_profile()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata'  ->> 'artistProfile', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'artistProfile', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    ''
  )
$$;

-- 4) Policies (somente usuários autenticados) -------------------------
--    (select public.fn()) faz o Postgres avaliar a função uma única vez
--    por query, em vez de uma vez por linha — bem mais rápido.

-- LEITURA: admin vê tudo; artista vê apenas os próprios shows.
create policy "events_select" on public.events
  for select to authenticated
  using (
    (select public.is_admin())
    or artist = (select public.current_artist_profile())
  );

-- INSERÇÃO: somente admin cadastra.
create policy "events_insert" on public.events
  for insert to authenticated
  with check ( (select public.is_admin()) );

-- ATUALIZAÇÃO: somente admin edita (USING + WITH CHECK).
create policy "events_update" on public.events
  for update to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- EXCLUSÃO: somente admin exclui.
create policy "events_delete" on public.events
  for delete to authenticated
  using ( (select public.is_admin()) );

-- 5) Conferência: deve listar exatamente as 4 policies, role {authenticated}
select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'events'
order by policyname;

-- =====================================================================
--  AÇÕES COMPLEMENTARES (fora deste script):
--
--  1) ROTACIONE a chave `service_role` antiga no painel
--     (Settings → API → Rotate), pois ela IGNORA todo o RLS e já
--     esteve exposta. Nunca a coloque no código do navegador.
--
--  2) NOTA DE SEGURANÇA (escopo de artista):
--     Enquanto `artistProfile` vier de `user_metadata`, um artista
--     consegue LER shows de outro artista editando o próprio metadado.
--     Correção definitiva: criar uma tabela `profiles` (user_id → artista)
--     gerida pelo Admin, com RLS, e ler o perfil dela em vez do JWT.
--     (Posso gerar esse script se você quiser fechar 100% esse ponto.)
-- =====================================================================
