-- =====================================================================
--  StartBookings — 019: cadastro aberto SOMENTE para e-mails pré-vinculados
--  Requer 001, 004, 005 e 012 rodadas. SQL Editor → Run. Idempotente.
--
--  O DILEMA QUE ESTE SCRIPT RESOLVE
--   O parecer recomendou fechar o autocadastro (achados P-08 e SB-05), mas
--   fechá-lo por completo impediria os artistas e bookers já pré-vinculados de
--   criar suas contas — que é justamente como o sistema deve funcionar.
--
--   A solução é intermediária e melhor que as duas pontas: o autocadastro
--   CONTINUA LIGADO, mas só aceita e-mails que o admin já vinculou. Assim:
--     • Quem você pré-cadastrou cria a conta sozinho, sem depender de você.
--     • Um estranho da internet NÃO consegue criar conta.
--
--  FONTES DE AUTORIZAÇÃO (basta estar em uma delas)
--   1. artist_emails      — artistas
--   2. booker_emails      — bookers/vendedores
--   3. logistics_emails   — equipe de logística
--   4. signup_allowlist   — tabela criada aqui, para exceções (ex.: novo admin)
--   5. allowlist de admin — os e-mails fixos de is_admin()
--
--  ⚠️ IMPORTANTE: com isto ativo, o botão "Add user" do painel do Supabase
--     também passa a respeitar a allowlist. Para liberar alguém novo, primeiro
--     insira o e-mail em uma das tabelas acima (passo 4 mostra como).
-- =====================================================================

-- =====================================================================
-- 1) Tabela de exceções (para quem não é artista, booker nem logística)
-- =====================================================================
create table if not exists public.signup_allowlist (
  email      text primary key,
  nota       text,
  criado_em  timestamptz not null default now()
);

alter table public.signup_allowlist enable row level security;

drop policy if exists "signup_allowlist_admin" on public.signup_allowlist;
create policy "signup_allowlist_admin" on public.signup_allowlist
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

comment on table public.signup_allowlist is
  'E-mails autorizados a criar conta que nao estao em artist_emails/booker_emails/logistics_emails.';

-- =====================================================================
-- 2) Função de verificação
-- =====================================================================
create or replace function public.check_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
begin
  -- Sem e-mail (fluxos internos do Auth): não bloqueia
  if v_email = '' then
    return new;
  end if;

  if v_email in ('admin@startbookings.com','startbookings@gmail.com','cassiac.gouveia@gmail.com')
     or exists (select 1 from public.artist_emails    ae where lower(ae.email) = v_email)
     or exists (select 1 from public.booker_emails    be where lower(be.email) = v_email)
     or exists (select 1 from public.logistics_emails le where lower(le.email) = v_email)
     or exists (select 1 from public.signup_allowlist sa where lower(sa.email) = v_email)
  then
    return new;
  end if;

  raise exception
    'E-mail nao autorizado para cadastro no StartBookings. Peca ao administrador para vincular seu e-mail antes de criar a conta.'
    using errcode = 'check_violation';
end;
$$;

-- =====================================================================
-- 3) Trigger — roda ANTES de criar o usuário, para poder abortar
--    (o handle_new_user continua rodando DEPOIS, definindo o papel)
-- =====================================================================
drop trigger if exists on_auth_user_signup_allowlist on auth.users;
create trigger on_auth_user_signup_allowlist
  before insert on auth.users
  for each row execute function public.check_signup_allowlist();

-- =====================================================================
-- 4) COMO LIBERAR ALGUÉM NOVO
-- =====================================================================
-- Artista  -> insert into public.artist_emails (email, artist_name)
--             values ('novo@artista.com','Nome Artistico')
--             on conflict (email) do update set artist_name = excluded.artist_name;
--
-- Booker   -> insert into public.booker_emails (email, booker_name)
--             values ('novo@booker.com','Nome') on conflict (email) do nothing;
--
-- Logistica-> insert into public.logistics_emails (email)
--             values ('novo@logistica.com') on conflict (email) do nothing;
--
-- Exceção  -> insert into public.signup_allowlist (email, nota)
--             values ('pessoa@exemplo.com','motivo') on conflict (email) do nothing;

-- =====================================================================
-- 5) CONFERÊNCIA — quem pode se cadastrar hoje
-- =====================================================================
select 'artista'   as origem, email from public.artist_emails
union all select 'booker',    email from public.booker_emails
union all select 'logistica', email from public.logistics_emails
union all select 'excecao',   email from public.signup_allowlist
union all select 'admin fixo', unnest(array['admin@startbookings.com','startbookings@gmail.com','cassiac.gouveia@gmail.com'])
order by origem, email;

-- Quem JÁ tem conta criada (esses não são afetados):
select email, created_at from auth.users order by created_at;
