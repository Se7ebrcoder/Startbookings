-- =====================================================================
--  StartBookings — Cassia (cassiac.gouveia@gmail.com) como ADMIN de verdade.
--  Requer 001 e 005 já rodados. SQL Editor → cole → Run. Idempotente.
--
--  POR QUE ASSIM
--   O controle de admin do sistema é por ALLOWLIST DE E-MAIL nas funções
--   is_admin() (RLS) e handle_new_user() (papel no signup). Adicionar o e-mail
--   da Cassia aqui funciona NOS DOIS casos — não importa se ela já criou conta
--   ou não:
--     • Se JÁ tem conta: o is_admin() passa a retornar true para ela e o
--       backfill abaixo marca profiles.role='Admin'.
--     • Se AINDA vai criar: o trigger de signup já a cria como Admin.
--
--   ⚠️ Isto concede acesso TOTAL de admin (ler/editar/excluir tudo). Para
--   reverter, basta rodar de novo estas funções sem o e-mail dela.
-- =====================================================================

-- 1) is_admin(): adiciona o e-mail da Cassia à allowlist (mantém o resto igual à 001)
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
      'startbookings@gmail.com',
      'cassiac.gouveia@gmail.com'
    )
$$;

-- 2) handle_new_user(): mesma lógica da 005 (Admin/Logistica/Booker/Artista),
--    só somando o e-mail da Cassia à condição de Admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := 'Artista';
  v_name text;
begin
  if lower(coalesce(new.email,'')) in
       ('admin@startbookings.com','startbookings@gmail.com','cassiac.gouveia@gmail.com') then
    v_role := 'Admin';
  elsif exists (select 1 from public.logistics_emails le where lower(le.email)=lower(coalesce(new.email,''))) then
    v_role := 'Logistica';
  elsif exists (select 1 from public.booker_emails be where lower(be.email)=lower(coalesce(new.email,''))) then
    v_role := 'Booker';
    select be.booker_name into v_name from public.booker_emails be where lower(be.email)=lower(coalesce(new.email,''));
  end if;

  if v_name is null then
    select ae.artist_name into v_name from public.artist_emails ae where lower(ae.email)=lower(coalesce(new.email,''));
  end if;

  insert into public.profiles (id, email, role, artist_name)
  values (new.id, lower(coalesce(new.email,'')), v_role, v_name)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- 3) Backfill: se a Cassia JÁ tem conta, marca como Admin agora.
--    (Se ainda não tem, isto afeta 0 linhas — inofensivo; o trigger cuida no signup.)
update public.profiles
  set role = 'Admin'
  where lower(email) = 'cassiac.gouveia@gmail.com';

-- 4) Conferência: mostra se ela já existe e com que papel.
--    (Se não retornar linha, a conta dela ainda não foi criada — normal.)
select email, role, artist_name
from public.profiles
where lower(email) = 'cassiac.gouveia@gmail.com';
