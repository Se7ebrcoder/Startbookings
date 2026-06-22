-- =====================================================================
--  StartBookings — Kanban de Eventos: tabela event_cards (RLS admin)
--  Requer supabase_profiles_setup.sql (is_admin). SQL Editor → Run. Idempotente.
--
--  O QUE FAZ
--   • 1 linha por evento (group_id): coluna do quadro, checklist (JSON),
--     e lembrete opcional { data, ativo }.
--   • Acesso SÓ admin (RLS).
-- =====================================================================
create table if not exists public.event_cards (
  group_id   text primary key,
  coluna     text not null default 'todo' check (coluna in ('todo','progress','done')),
  checklist  jsonb not null default '[]'::jsonb,
  lembrete   jsonb,                       -- { "data":"YYYY-MM-DD", "ativo":bool }
  updated_at timestamptz not null default now()
);

alter table public.event_cards enable row level security;
drop policy if exists "event_cards_admin_all" on public.event_cards;
create policy "event_cards_admin_all" on public.event_cards
  for all to authenticated
  using ( (select public.is_admin()) ) with check ( (select public.is_admin()) );

-- Conferência
select policyname, cmd from pg_policies where schemaname='public' and tablename='event_cards';
