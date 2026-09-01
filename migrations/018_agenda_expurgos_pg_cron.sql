-- =====================================================================
--  StartBookings — 018: agenda os expurgos da LGPD no pg_cron
--  Requer 015 e 016 rodadas E a extensão pg_cron JÁ HABILITADA.
--  SQL Editor → Run. Idempotente (reagenda sem duplicar).
--
--  POR QUE ESTE ARQUIVO EXISTE
--   As migrações 015 e 016 tentavam agendar sozinhas, mas só se o pg_cron já
--   estivesse habilitado no momento em que rodaram. Como a extensão foi ligada
--   DEPOIS, os blocos foram ignorados e `cron.job` ficou vazio — ou seja, as
--   funções de expurgo existem mas nunca são executadas.
--
--   Diferente das anteriores, este script NÃO engole erros: se algo falhar,
--   você vai ver a mensagem em vez de um silêncio enganoso.
-- =====================================================================

-- 1) Confere o pré-requisito de forma explícita
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron NAO esta habilitado. Ative em Database > Extensions e rode este script de novo.';
  end if;
end $$;

-- 2) Remove agendamentos anteriores com os mesmos nomes (evita duplicar)
do $$
declare j text;
begin
  foreach j in array array['sb_purge_audit','sb_purge_login','sb_mascara_pnr','sb_anonimiza_logist']
  loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
      raise notice 'Agendamento anterior removido: %', j;
    end if;
  end loop;
end $$;

-- 3) Agenda os quatro expurgos
--    Horários em UTC. 03:00/04:00 UTC = 00:00/01:00 no horário de Brasília.
select cron.schedule('sb_purge_audit',      '0 3 * * 0', $$select public.purge_audit_logs(24)$$);
select cron.schedule('sb_purge_login',      '0 3 * * 0', $$select public.purge_login_logs(6)$$);
select cron.schedule('sb_mascara_pnr',      '0 4 * * *', $$select public.mascarar_localizadores(2)$$);
select cron.schedule('sb_anonimiza_logist', '0 4 * * *', $$select public.anonimizar_logistica_antiga(90)$$);

-- 4) CONFERÊNCIA — devem aparecer 4 linhas, todas active = true
select jobname, schedule, active, command
  from cron.job
 where jobname like 'sb_%'
 order by jobname;
