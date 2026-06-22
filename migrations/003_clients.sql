-- =====================================================================
--  StartBookings — Setup do módulo de Clientes
--  SQL Editor → New query → cole tudo → Run. Idempotente (pode rodar de novo).
-- =====================================================================

-- 1) Tabela de clientes
create table if not exists public.clients (
  id text primary key,
  name text not null,
  contact text default '',
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);

-- 2) Colunas novas em events
alter table public.events add column if not exists client_id text;
alter table public.events add column if not exists contract_status text default 'pendente';

-- 3) RLS da tabela clients (somente admin)
alter table public.clients enable row level security;

drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;
drop policy if exists "clients_delete" on public.clients;

create policy "clients_select" on public.clients
  for select to authenticated using ( public.is_admin() );
create policy "clients_insert" on public.clients
  for insert to authenticated with check ( public.is_admin() );
create policy "clients_update" on public.clients
  for update to authenticated using ( public.is_admin() ) with check ( public.is_admin() );
create policy "clients_delete" on public.clients
  for delete to authenticated using ( public.is_admin() );

-- 4) Cliente padrão "A definir" + vínculo dos eventos antigos
insert into public.clients (id, name, contact)
values ('cli-a-definir', 'A definir', '')
on conflict (id) do nothing;

update public.events set client_id = 'cli-a-definir' where client_id is null;

-- 5) Conferência
select c.id, c.name, count(e.id) as eventos
from public.clients c
left join public.events e on e.client_id = c.id
group by c.id, c.name
order by c.name;
