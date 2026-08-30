-- =====================================================================
--  StartBookings — Preenche os mapas e-mail→nome no banco ANTES de a
--  versão segura do frontend entrar no ar.
--  Requer 001, 005 e 010 já rodados. SQL Editor → cole → Run. Idempotente.
--
--  POR QUE
--   A versão ANTIGA que estava em produção tinha os mapas e-mail→artista/
--   booker/admin HARDCODED no JavaScript (PII exposta + escalonamento por
--   user_metadata). A versão segura lê esses mapas SÓ do banco. Este script
--   garante que tudo que estava hardcoded esteja no banco, para que ninguém
--   perca login por nome nem resolução de papel quando a versão segura subir.
-- =====================================================================

-- 1) ARTISTAS — garante os 8 (a 001 só tinha 6; faltavam Invader Space e Shuri)
insert into public.artist_emails (email, artist_name) values
  ('contato.anotherreality@gmail.com', 'Another Reality'),
  ('parallelusmusic@gmail.com',        'Parallelus'),
  ('atomuz_@outlook.com',              'Atomuz'),
  ('contatoartisticope@gmail.com',     'Bug System'),
  ('giuseppebandini36@gmail.com',      'Bandini'),
  ('raianlameira@hotmail.com',         'Se7e'),
  ('gabrielramos0420@gmail.com',       'Invader Space'),
  ('oliveira.lay12@gmail.com',         'Shuri')
on conflict (email) do update set artist_name = excluded.artist_name;

-- 2) BOOKERS — garante Rayanne e Heloísa (já vieram na 005; idempotente)
insert into public.booker_emails (email, booker_name) values
  ('rayannecaldas@gmail.com',    'Rayanne'),
  ('mheloisasoaresth@gmail.com', 'Heloísa')
on conflict (email) do update set booker_name = excluded.booker_name;

-- 3) BACKFILL de profiles p/ quem JÁ tem conta
--    (nome do artista e papel de booker, sem mexer em quem é Admin)
update public.profiles p
  set artist_name = ae.artist_name
  from public.artist_emails ae
  where lower(p.email) = lower(ae.email) and p.role = 'Artista';

update public.profiles p
  set role = 'Booker', artist_name = be.booker_name
  from public.booker_emails be
  where lower(p.email) = lower(be.email) and p.role <> 'Admin';

-- 4) ROSTER — garante os nomes no elenco/equipe (caso a 010 tenha rodado
--    antes destes mapas existirem). Idempotente.
insert into public.roster (name, kind)
  select artist_name, 'artist' from public.artist_emails
on conflict (name, kind) do nothing;

insert into public.roster (name, kind)
  select booker_name, 'seller' from public.booker_emails
on conflict (name, kind) do nothing;

-- =====================================================================
-- 5) [DECISÃO DE ACESSO] Cassia como ADMIN de verdade
-- ---------------------------------------------------------------------
--  ⚠️ ATENÇÃO: isto concede acesso TOTAL de admin (ler/editar/excluir TUDO)
--  ao e-mail abaixo. No código ANTIGO a Cassia era "admin" apenas na tela —
--  o RLS NUNCA a tratou como admin. Se você NÃO quer dar acesso total a ela,
--  comente/remova este bloco 5 (ela continua como vendedora/booker normal).
--
--  Mecanismo: grava role=Admin no app_metadata do usuário (fonte confiável
--  que só o backend define; é o que is_admin() checa via JWT). Passa a valer
--  no próximo login/refresh de token dela.
update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"Admin"}'::jsonb
  where lower(email) = 'cassiac.gouveia@gmail.com';

-- Reflete também em profiles (para a UI mostrar Admin e por consistência)
update public.profiles
  set role = 'Admin'
  where lower(email) = 'cassiac.gouveia@gmail.com';
-- =====================================================================

-- 6) CONFERÊNCIAS
select 'artist_emails' as tabela, count(*) from public.artist_emails
union all select 'booker_emails', count(*) from public.booker_emails
union all select 'roster', count(*) from public.roster;

select email, role, artist_name from public.profiles order by role, email;
