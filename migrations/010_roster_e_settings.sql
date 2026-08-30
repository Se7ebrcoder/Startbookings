-- =====================================================================
--  StartBookings — Persistência do ELENCO (artistas), EQUIPE (vendedores/
--  bookers), CORES das tags e METAS no banco.
--  Requer 001_profiles_and_rls.sql já rodado (função is_admin()).
--  SQL Editor → New query → cole tudo → Run. Idempotente.
--
--  POR QUE ISTO EXISTE
--   Antes, a lista de artistas/vendedores, as cores e as metas viviam SÓ no
--   localStorage do navegador. Qualquer logout (clearLocalPII), troca de
--   navegador/dispositivo ou bump de versão apagava tudo e obrigava a
--   recadastrar. Agora o banco é a fonte de verdade; o localStorage vira só
--   cache. Eventos/clientes/logística já eram persistidos — isto fecha o
--   buraco do elenco/equipe/cores/metas.
--
--  MODELO
--   • roster: uma linha por (nome, tipo) — tipo = 'artist' ou 'seller'.
--     Guarda a cor da tag junto. LEITURA por qualquer usuário logado (o app
--     precisa mostrar nomes/cores nos dropdowns e tabelas); ESCRITA só admin.
--   • goals: meta anual por nome. Mesmo esquema de RLS.
--   Obs.: os NOMES aqui não são PII (são nomes artísticos/de equipe já
--   exibidos no app). Os e-mails continuam SÓ em artist_emails/booker_emails,
--   que permanecem admin-only.
-- =====================================================================

-- 1) ELENCO + EQUIPE (com a cor da tag)
create table if not exists public.roster (
  name  text not null,
  kind  text not null check (kind in ('artist','seller')),
  color text,
  created_at timestamptz not null default now(),
  primary key (name, kind)
);

alter table public.roster enable row level security;

-- leitura: qualquer usuário autenticado (para render de dropdowns/tags/cores)
drop policy if exists "roster_select_authenticated" on public.roster;
create policy "roster_select_authenticated" on public.roster
  for select to authenticated
  using ( true );

-- escrita (insert/update/delete): só admin
drop policy if exists "roster_admin_write" on public.roster;
create policy "roster_admin_write" on public.roster
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- 2) METAS (por nome)
create table if not exists public.goals (
  name   text primary key,
  amount numeric not null default 0
);

alter table public.goals enable row level security;

drop policy if exists "goals_select_authenticated" on public.goals;
create policy "goals_select_authenticated" on public.goals
  for select to authenticated
  using ( true );

drop policy if exists "goals_admin_write" on public.goals;
create policy "goals_admin_write" on public.goals
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

-- 3) Backfill a partir dos NOMES já existentes em events (rede de segurança:
--    garante que artistas/vendedores que já têm shows não fiquem de fora, mesmo
--    que o localStorage do admin já tenha sido perdido). Cor fica nula (o app
--    aplica uma cor padrão e o admin pode ajustar depois).
insert into public.roster (name, kind)
  select distinct artist, 'artist' from public.events
   where coalesce(artist,'') <> ''
on conflict (name, kind) do nothing;

insert into public.roster (name, kind)
  select distinct vendedor, 'seller' from public.events
   where coalesce(vendedor,'') <> ''
on conflict (name, kind) do nothing;

-- Também traz nomes já mapeados em artist_emails / booker_emails.
insert into public.roster (name, kind)
  select distinct artist_name, 'artist' from public.artist_emails
   where coalesce(artist_name,'') <> ''
on conflict (name, kind) do nothing;

insert into public.roster (name, kind)
  select distinct booker_name, 'seller' from public.booker_emails
   where coalesce(booker_name,'') <> ''
on conflict (name, kind) do nothing;

-- 4) Conferência
select kind, count(*) from public.roster group by kind;
select * from public.goals order by name;
