-- =====================================================================
--  StartBookings — 015: LGPD — minimização do audit_logs + retenção
--  Requer 007 (audit_logs/login_logs) já rodada. SQL Editor → Run. Idempotente.
--
--  RESOLVE os achados P-01, P-02 e parte do P-09 do parecer de 30/08/2026.
--
--  O QUE MUDA
--   1. fn_audit passa a gravar SÓ OS CAMPOS ALTERADOS (delta), não a linha
--      inteira — antes, cada UPDATE duplicava todo o registro em JSONB.
--   2. Campos de alto risco são REDIGIDOS no log (session_token, localizador
--      de passagem, placa, motorista, endereço de hotel, contato do cliente e
--      o payload inteiro de logística). O log continua provando O QUE mudou e
--      QUEM mudou, sem manter uma segunda cópia do dado pessoal.
--   3. Funções de EXPURGO com a temporalidade definida no parecer:
--        audit_logs -> 24 meses | login_logs -> 6 meses (Marco Civil, Art. 15)
--   4. login_logs deixa de aceitar INSERT do cliente (o usuário conseguia
--      forjar o próprio registro de acesso); passa a ser gravado por função
--      SECURITY DEFINER, o que preserva o valor probatório do log.
--
--  ⚠️ Este script NÃO apaga nada sozinho. O expurgo só roda quando você
--     chamar a função ou agendar o pg_cron (passo 5, opcional).
-- =====================================================================

-- =====================================================================
-- 1) REDAÇÃO — remove do log os valores que não precisam ser duplicados
-- =====================================================================
create or replace function public.fn_audit_redigir(j jsonb, p_table text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  chaves_sensiveis text[] := array[
    'session_token',   -- credencial de sessão
    'contact',         -- contato do cliente
    'localizador',     -- PNR: permite alterar/cancelar a reserva
    'placa',
    'motoristaNome',
    'hotelEndereco',
    'hotelNome',
    'recepcaoNome',
    'pontoEncontro'
  ];
begin
  if j is null then return null; end if;

  -- Logística: a coluna `data` carrega TODO o roteiro (hotel, voo, motorista,
  -- PNR). Não faz sentido duplicá-la no log — guardamos só a marca de que mudou.
  if p_table = 'logistics' and j ? 'data' then
    j := jsonb_set(j, '{data}', '"[REDIGIDO: roteiro de viagem]"'::jsonb);
  end if;

  foreach k in array chaves_sensiveis loop
    if j ? k then
      j := jsonb_set(j, array[k], '"[REDIGIDO]"'::jsonb);
    end if;
  end loop;

  return j;
end;
$$;

-- =====================================================================
-- 2) fn_audit — agora grava DELTA (só o que mudou) e já redigido
-- =====================================================================
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_row_id text;
  v_keys   text[];
begin
  if (TG_OP = 'DELETE') then
    v_old := to_jsonb(OLD);
  elsif (TG_OP = 'UPDATE') then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else
    v_new := to_jsonb(NEW);
  end if;

  v_row_id := coalesce(
    coalesce(v_new, v_old) ->> 'id',
    coalesce(v_new, v_old) ->> 'group_id',
    coalesce(v_new, v_old) ->> 'email'
  );

  -- Mantém o filtro de ruído do login/refresh (comportamento da 007)
  if (TG_OP = 'UPDATE' and TG_TABLE_NAME = 'profiles') then
    if ((v_old - 'session_token') is not distinct from (v_new - 'session_token')) then
      return NEW;
    end if;
  end if;

  -- MINIMIZAÇÃO (LGPD Art. 6º, III): no UPDATE, guarda apenas as chaves que
  -- realmente mudaram, dos dois lados. Antes guardava a linha inteira duas vezes.
  if (TG_OP = 'UPDATE') then
    select coalesce(array_agg(key), array[]::text[])
      into v_keys
      from jsonb_each(v_new)
     where v_old -> key is distinct from v_new -> key;

    if array_length(v_keys, 1) is null then
      return NEW;  -- nada mudou de fato
    end if;

    v_old := (select coalesce(jsonb_object_agg(k, v_old -> k), '{}'::jsonb) from unnest(v_keys) k);
    v_new := (select coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb) from unnest(v_keys) k);
  end if;

  insert into public.audit_logs(
    actor_id, actor_email, table_name, operation, row_id, old_data, new_data)
  values (
    auth.uid(),
    lower(coalesce(auth.jwt() ->> 'email', '')),
    TG_TABLE_NAME,
    TG_OP,
    v_row_id,
    public.fn_audit_redigir(v_old, TG_TABLE_NAME),
    public.fn_audit_redigir(v_new, TG_TABLE_NAME)
  );

  if (TG_OP = 'DELETE') then return OLD; else return NEW; end if;
end;
$$;

-- =====================================================================
-- 3) EXPURGO — temporalidade do parecer (LGPD Art. 15 e 16)
-- =====================================================================

-- audit_logs: 24 meses
create or replace function public.purge_audit_logs(p_meses int default 24)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  delete from public.audit_logs
   where changed_at < (now() - make_interval(months => p_meses));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- login_logs: 6 meses (espelha o Marco Civil da Internet, Art. 15)
create or replace function public.purge_login_logs(p_meses int default 6)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  delete from public.login_logs
   where logged_at < (now() - make_interval(months => p_meses));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Só admin pode disparar o expurgo manualmente
revoke all on function public.purge_audit_logs(int) from public, anon, authenticated;
revoke all on function public.purge_login_logs(int) from public, anon, authenticated;

-- =====================================================================
-- 4) INTEGRIDADE do login_logs (P-09)
--    Antes: `grant insert` + policy `with check (user_id = auth.uid())` permitia
--    o próprio usuário inserir registros de acesso — log forjável, sem valor
--    probatório. Agora a gravação passa por função SECURITY DEFINER.
-- =====================================================================
drop policy if exists "login_insert_own" on public.login_logs;
revoke insert on public.login_logs from authenticated;

create or replace function public.registrar_login(p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;  -- sem sessão, não registra
  end if;
  insert into public.login_logs (user_id, email, user_agent)
  values (
    auth.uid(),
    lower(coalesce(auth.jwt() ->> 'email', '')),
    left(coalesce(p_user_agent, ''), 400)   -- limita tamanho (minimização)
  );
end;
$$;

grant execute on function public.registrar_login(text) to authenticated;

-- =====================================================================
-- 5) AGENDAMENTO AUTOMÁTICO (opcional — requer a extensão pg_cron)
--    Se o pg_cron não estiver habilitado, este bloco é ignorado sem erro e o
--    expurgo continua disponível para chamada manual. Para habilitar:
--    Dashboard → Database → Extensions → pg_cron.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('sb_purge_audit')  where exists (select 1 from cron.job where jobname = 'sb_purge_audit');
    perform cron.unschedule('sb_purge_login')  where exists (select 1 from cron.job where jobname = 'sb_purge_login');
    perform cron.schedule('sb_purge_audit', '0 3 * * 0', 'select public.purge_audit_logs(24)');
    perform cron.schedule('sb_purge_login', '0 3 * * 0', 'select public.purge_login_logs(6)');
    raise notice 'pg_cron: expurgo semanal agendado (domingos 03:00 UTC).';
  else
    raise notice 'pg_cron NAO habilitado. Habilite em Database > Extensions e rode este bloco de novo, ou chame as funcoes manualmente.';
  end if;
exception when others then
  raise notice 'Nao foi possivel agendar via pg_cron (%). Expurgo segue disponivel manualmente.', sqlerrm;
end $$;

-- =====================================================================
-- 6) CONFERÊNCIAS
-- =====================================================================
-- Volume atual e o que seria expurgado hoje:
select
  (select count(*) from public.audit_logs) as audit_total,
  (select count(*) from public.audit_logs where changed_at < now() - interval '24 months') as audit_a_expurgar,
  (select count(*) from public.login_logs) as login_total,
  (select count(*) from public.login_logs where logged_at  < now() - interval '6 months')  as login_a_expurgar;

-- login_logs não deve mais aceitar INSERT direto do cliente:
select policyname, cmd from pg_policies
 where schemaname='public' and tablename='login_logs' order by policyname;
