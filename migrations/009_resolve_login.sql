-- =====================================================================
--  StartBookings — 009: login por nome de artista SEM expor e-mails no front
--  Requer 001 (artist_emails) e 005 (booker_emails). SQL Editor → Run.
--  IDEMPOTENTE (pode rodar de novo).
--
--  CONTEXTO (achado #2 da auditoria de 04/07/2026)
--  O front tinha mapas hardcoded e-mail→nome (admins, bookers, artistas) só
--  para permitir login pelo "nome do projeto". Isso expunha e-mails pessoais
--  a qualquer visitante. Esta RPC resolve nome→e-mail NO SERVIDOR; o front
--  não carrega mais nenhum e-mail antes do login.
--
--  TRADE-OFF CONSCIENTE: a RPC precisa ser executável por `anon` (roda antes
--  do login). Quem souber o nome EXATO de um artista consegue descobrir o
--  e-mail de login dele. É muito menos exposto que a situação anterior
--  (todos os e-mails no bundle público), mas se quiser eliminar 100%,
--  remova esta RPC e exija login apenas por e-mail.
-- =====================================================================

create or replace function public.resolve_login_email(identifier text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.email from (
    select ae.email
      from public.artist_emails ae
      where lower(ae.artist_name) = lower(trim(identifier))
    union all
    select be.email
      from public.booker_emails be
      where lower(be.booker_name) = lower(trim(identifier))
  ) t
  limit 1
$$;

-- Só os papéis da API podem executar (e mais ninguém herda de PUBLIC)
revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- =====================================================================
-- CONFERÊNCIA
-- =====================================================================
-- select public.resolve_login_email('Se7e');          -- deve retornar o e-mail
-- select public.resolve_login_email('nao-existe');    -- deve retornar null
