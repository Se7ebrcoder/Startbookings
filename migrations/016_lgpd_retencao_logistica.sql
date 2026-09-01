-- =====================================================================
--  StartBookings — 016: LGPD — retenção e anonimização da logística
--  Requer 004 (logistics) já rodada. SQL Editor → Run. Idempotente.
--
--  RESOLVE os achados P-02 (logística), P-03 (localizador) e P-04 (roteiro
--  como dado de localização) do parecer de 30/08/2026.
--
--  O PROBLEMA
--   O roteiro de viagem (hotel, endereço, voo, localizador, motorista, placa)
--   é o dado de maior risco do sistema: revela ONDE um artista conhecido
--   estará e QUANDO. Passado o show, a finalidade se exaure (LGPD Art. 15) e
--   manter o dado só gera risco — de perseguição, assédio ou furto.
--
--  A SOLUÇÃO, EM DUAS ETAPAS
--   Etapa 1 (D+2 do show):  mascara o LOCALIZADOR da passagem, que é uma
--     credencial — com ele e o sobrenome se altera ou cancela a reserva no
--     site da companhia aérea.
--   Etapa 2 (D+90 do show): anonimiza o roteiro inteiro, PRESERVANDO os
--     valores financeiros (ida/volta/hotel), para que o módulo Financeiro e o
--     histórico de faturamento continuem corretos.
--
--  ⚠️ Nada é apagado ao rodar este script. As funções só agem quando chamadas
--     ou quando o pg_cron as executa (passo 4, opcional).
-- =====================================================================

-- =====================================================================
-- 1) ETAPA 1 — mascarar o localizador (PNR) após o embarque
-- =====================================================================
create or replace function public.mascarar_localizadores(p_dias int default 2)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      record;
  v_data jsonb;
  v_loc  text;
  v_n    integer := 0;
begin
  for r in
    select id, data
      from public.logistics
     where event_date ~ '^\d{4}-\d{2}-\d{2}$'
       and event_date::date < (current_date - p_dias)
  loop
    v_data := r.data;

    foreach v_loc in array array['ida','volta'] loop
      if (v_data -> v_loc ? 'localizador')
         and coalesce(v_data -> v_loc ->> 'localizador', '') <> ''
         and (v_data -> v_loc ->> 'localizador') not like '%•%'
      then
        v_data := jsonb_set(
          v_data,
          array[v_loc, 'localizador'],
          to_jsonb('••••' || right(v_data -> v_loc ->> 'localizador', 2))
        );
      end if;
    end loop;

    if v_data is distinct from r.data then
      update public.logistics set data = v_data where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end;
$$;

-- =====================================================================
-- 2) ETAPA 2 — anonimizar o roteiro após 90 dias, mantendo os valores
-- =====================================================================
create or replace function public.anonimizar_logistica_antiga(p_dias int default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      record;
  v_data jsonb;
  v_n    integer := 0;
begin
  for r in
    select id, data
      from public.logistics
     where event_date ~ '^\d{4}-\d{2}-\d{2}$'
       and event_date::date < (current_date - p_dias)
       and not (data ? 'anonimizado_em')     -- ainda não anonimizado
  loop
    -- Preserva SOMENTE o necessário ao histórico financeiro:
    -- modo de transporte e valor de cada trecho + valor do hotel.
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'anonimizado_em', to_jsonb(now()),
      'temHospedagem',  r.data -> 'temHospedagem',
      'ida', case when r.data ? 'ida' then jsonb_build_object(
                'modo',  r.data -> 'ida' -> 'modo',
                'valor', r.data -> 'ida' -> 'valor') end,
      'volta', case when r.data ? 'volta' then jsonb_build_object(
                'modo',  r.data -> 'volta' -> 'modo',
                'valor', r.data -> 'volta' -> 'valor') end,
      'hotel', case when r.data ? 'hotel' then jsonb_build_object(
                'valor', r.data -> 'hotel' -> 'valor') end
    ));

    update public.logistics set data = v_data where id = r.id;
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

revoke all on function public.mascarar_localizadores(int)      from public, anon, authenticated;
revoke all on function public.anonimizar_logistica_antiga(int) from public, anon, authenticated;

-- =====================================================================
-- 3) SIMULAÇÃO — rode ANTES para ver o impacto, sem alterar nada
-- =====================================================================
select
  count(*) filter (where event_date ~ '^\d{4}-\d{2}-\d{2}$'
                     and event_date::date < current_date - 2)  as com_pnr_a_mascarar,
  count(*) filter (where event_date ~ '^\d{4}-\d{2}-\d{2}$'
                     and event_date::date < current_date - 90
                     and not (data ? 'anonimizado_em'))        as roteiros_a_anonimizar,
  count(*)                                                     as total_logisticas
from public.logistics;

-- =====================================================================
-- 4) AGENDAMENTO (opcional — requer pg_cron). Ignorado sem erro se ausente.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('sb_mascara_pnr')      where exists (select 1 from cron.job where jobname = 'sb_mascara_pnr');
    perform cron.unschedule('sb_anonimiza_logist') where exists (select 1 from cron.job where jobname = 'sb_anonimiza_logist');
    perform cron.schedule('sb_mascara_pnr',      '0 4 * * *', 'select public.mascarar_localizadores(2)');
    perform cron.schedule('sb_anonimiza_logist', '0 4 * * *', 'select public.anonimizar_logistica_antiga(90)');
    raise notice 'pg_cron: mascaramento e anonimizacao agendados (diariamente, 04:00 UTC).';
  else
    raise notice 'pg_cron NAO habilitado. Chame as funcoes manualmente ou habilite a extensao.';
  end if;
exception when others then
  raise notice 'Nao foi possivel agendar (%). Funcoes seguem disponiveis manualmente.', sqlerrm;
end $$;

-- =====================================================================
-- 5) EXECUÇÃO MANUAL (descomente para rodar agora)
-- =====================================================================
-- select public.mascarar_localizadores(2)      as pnrs_mascarados;
-- select public.anonimizar_logistica_antiga(90) as roteiros_anonimizados;
