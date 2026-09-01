-- =====================================================================
--  StartBookings — 020: registro de aceite dos Termos e da Política
--  Requer 001 rodada. SQL Editor → Run. Idempotente.
--
--  PARA QUE SERVE
--   A LGPD e o Código Civil exigem que se possa PROVAR que a pessoa foi
--   informada e concordou. Esta tabela é essa prova: guarda quem aceitou,
--   qual VERSÃO aceitou e quando.
--
--  POR QUE VERSIONADO
--   O aceite é por versão. Quando os Termos ou a Política mudarem, basta
--   subir a constante TERMS_VERSION no front que TODOS voltam a ver a tela
--   de aceite — inclusive quem já havia aceitado a versão anterior.
--
--  ALCANCE: como ninguém aceitou nada ainda, os usuários JÁ CADASTRADOS
--  também verão a tela no próximo login. Não é só para contas novas.
-- =====================================================================

create table if not exists public.terms_acceptance (
  user_id     uuid not null references auth.users (id) on delete cascade,
  version     text not null,
  accepted_at timestamptz not null default now(),
  user_agent  text,
  primary key (user_id, version)
);

create index if not exists terms_acceptance_user_idx on public.terms_acceptance (user_id);

alter table public.terms_acceptance enable row level security;

grant select, insert on public.terms_acceptance to authenticated;

-- Cada um enxerga o próprio aceite; o admin enxerga todos (para auditoria)
drop policy if exists "terms_select_own"   on public.terms_acceptance;
drop policy if exists "terms_select_admin" on public.terms_acceptance;
drop policy if exists "terms_insert_own"   on public.terms_acceptance;

create policy "terms_select_own" on public.terms_acceptance
  for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy "terms_select_admin" on public.terms_acceptance
  for select to authenticated
  using ( (select public.is_admin()) );

-- Ninguém pode registrar aceite em nome de outra pessoa
create policy "terms_insert_own" on public.terms_acceptance
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );

-- Sem policy de UPDATE/DELETE => o aceite é IMUTÁVEL pela API (vale como prova)

comment on table public.terms_acceptance is
  'Prova de aceite dos Termos de Uso e da Politica de Privacidade, por versao. Imutavel via API.';

-- =====================================================================
-- Função de registro — deriva o usuário do JWT (não confia no cliente)
-- =====================================================================
create or replace function public.registrar_aceite_termos(
  p_version text,
  p_user_agent text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;
  if coalesce(trim(p_version), '') = '' then
    raise exception 'Versao dos termos nao informada.';
  end if;

  insert into public.terms_acceptance (user_id, version, user_agent)
  values (auth.uid(), p_version, left(coalesce(p_user_agent, ''), 400))
  on conflict (user_id, version) do nothing;

  select accepted_at into v_at
    from public.terms_acceptance
   where user_id = auth.uid() and version = p_version;

  return v_at;
end;
$$;

grant execute on function public.registrar_aceite_termos(text, text) to authenticated;

-- =====================================================================
-- CONFERÊNCIAS
-- =====================================================================
-- Quem já aceitou, e qual versão:
select u.email, t.version, t.accepted_at
  from public.terms_acceptance t
  join auth.users u on u.id = t.user_id
 order by t.accepted_at desc;

-- Quem AINDA NÃO aceitou a versão corrente (troque '1.0' se mudar a versão):
select u.email
  from auth.users u
 where not exists (
   select 1 from public.terms_acceptance t
    where t.user_id = u.id and t.version = '1.0'
 )
 order by u.email;
