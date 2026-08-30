-- =====================================================================
--  StartBookings — 014: remove a RPC resolve_login_email (achado SB-02)
--  Requer 009 já rodada (é ela que criou a função). SQL Editor → Run.
--  IDEMPOTENTE (drop ... if exists).
--
--  ⚠️ RODE ESTE SCRIPT **DEPOIS** DE PUBLICAR O FRONTEND NOVO.
--     O site antigo chama esta função ao logar; se ela sumir antes do deploy,
--     quem digitar o nome artístico verá erro. (Rodar antes não impede o login
--     por e-mail — só quebra o login por nome, que estamos removendo mesmo.)
--
--  A FALHA
--   A função convertia nome artístico → e-mail e precisava ser executável por
--   `anon`, pois roda ANTES do login. Como nome artístico é público, qualquer
--   pessoa na internet colhia os e-mails pessoais de todos os artistas e
--   bookers (confirmado na auditoria: 7 e-mails reais obtidos anonimamente;
--   nome inexistente retornava null, servindo de oráculo de existência).
--
--  A DECISÃO
--   O login passa a ser SEMPRE por e-mail. Cada pessoa sabe o próprio e-mail,
--   então o custo é mínimo e a exposição de dado pessoal é eliminada por
--   completo — não sobra função pública para ser chamada.
--
--  PARA REVERTER (se um dia quiser o login por nome de volta)
--   Rode novamente a migração 009 e restaure a chamada em js/auth/auth.js.
--   Melhor ainda: reimplemente atrás de uma Edge Function que valide o token
--   do hCaptcha antes de responder, impedindo colheita em massa.
-- =====================================================================

-- 1) Remove a função (revoga junto todos os grants que ela tinha)
drop function if exists public.resolve_login_email(text);

-- 2) CONFERÊNCIA — deve retornar 0 linhas
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'resolve_login_email';
