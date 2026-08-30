-- =====================================================================
--  StartBookings — 013: CORREÇÃO CRÍTICA de RLS (comparação com string vazia)
--  Requer 001, 005 e 010 já rodados. SQL Editor → cole → Run. Idempotente.
--
--  ⚠️ RODE ESTE SCRIPT O QUANTO ANTES.
--
--  A FALHA (achado #1 da auditoria de 29/08/2026)
--   As policies de `events` comparavam assim:
--       artist   = current_artist_profile()
--       vendedor = current_booker_name()
--   As duas funções retornam '' (string vazia) para quem NÃO é artista/booker
--   (coalesce(..., '')). E o app grava '' — não NULL — quando o show está sem
--   artista ou sem vendedor definido (js/data/events.repo.js: `ev.artist || ""`).
--   Resultado: '' = '' é VERDADEIRO, então QUALQUER usuário autenticado sem
--   perfil (inclusive alguém que acabou de se cadastrar sozinho — o signup é
--   aberto) conseguia:
--     • LER   todo show com artista ou vendedor vazio  (events_select)
--     • ALTERAR todo show com vendedor vazio           (events_update)
--
--  A CORREÇÃO
--   Exige que o campo da linha E o perfil do usuário sejam NÃO-VAZIOS antes de
--   comparar (nullif + guarda explícita). Sem '' = '', não há casamento acidental.
-- =====================================================================

-- 1) LEITURA de events — admin vê tudo; artista/booker só o que é dele
drop policy if exists "events_select" on public.events;
create policy "events_select" on public.events
  for select to authenticated
  using (
    (select public.is_admin())
    or (
      coalesce(artist, '') <> ''
      and artist = nullif((select public.current_artist_profile()), '')
    )
    or (
      coalesce(vendedor, '') <> ''
      and vendedor = nullif((select public.current_booker_name()), '')
    )
  );

-- 2) ESCRITA (update) de events — booker só edita o que ele vendeu
drop policy if exists "events_update" on public.events;
create policy "events_update" on public.events
  for update to authenticated
  using (
    (select public.is_admin())
    or (
      coalesce(vendedor, '') <> ''
      and vendedor = nullif((select public.current_booker_name()), '')
    )
  )
  with check (
    (select public.is_admin())
    or (
      coalesce(vendedor, '') <> ''
      and vendedor = nullif((select public.current_booker_name()), '')
    )
  );

-- (insert e delete continuam admin-only, como já eram — não mexemos)

-- =====================================================================
-- 3) METAS (goals) — eram legíveis por QUALQUER usuário autenticado
--    (achado #3). Metas são dado financeiro do negócio: agora só o admin vê
--    tudo, e cada pessoa vê no máximo a própria linha.
-- =====================================================================
drop policy if exists "goals_select_authenticated" on public.goals;
drop policy if exists "goals_select" on public.goals;
create policy "goals_select" on public.goals
  for select to authenticated
  using (
    (select public.is_admin())
    or name = nullif((select public.current_booker_name()), '')
    or name = nullif((select public.current_artist_profile()), '')
  );

-- =====================================================================
-- 4) ELENCO/EQUIPE (roster) — era legível por qualquer autenticado
--    (achado #4). Passa a exigir papel interno: admin, booker ou logística.
--    Artistas NÃO precisam da lista completa — o app deriva os nomes dos
--    próprios shows deles e usa cor padrão; nada quebra.
-- =====================================================================
drop policy if exists "roster_select_authenticated" on public.roster;
drop policy if exists "roster_select" on public.roster;
create policy "roster_select" on public.roster
  for select to authenticated
  using (
    (select public.is_admin())
    or (select public.is_logistics())
    or nullif((select public.current_booker_name()), '') is not null
  );

-- =====================================================================
-- 5) CONFERÊNCIAS
-- =====================================================================
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('events','goals','roster')
order by tablename, policyname;

-- Quantos shows têm artista/vendedor vazio (eram os expostos):
select
  count(*) filter (where coalesce(artist,'')   = '') as shows_sem_artista,
  count(*) filter (where coalesce(vendedor,'') = '') as shows_sem_vendedor
from public.events;
