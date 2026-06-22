-- =====================================================================
--  StartBookings — Limpeza dos eventos de EXEMPLO que vazaram para o banco
-- ---------------------------------------------------------------------
--  Versões antigas do app re-enviavam 7 eventos fictícios para o Supabase
--  a cada login (ids fixos evt-1 .. evt-7). O código já foi corrigido para
--  não fazer mais isso. Este script remove os que já ficaram no banco.
--
--  É SEGURO: apaga só pelos ids fixos dos exemplos. Seus eventos reais têm
--  ids longos (ex.: evt-1780754723907710) e NÃO são afetados.
--
--  COMO USAR: SQL Editor → New query → cole tudo → Run.
-- =====================================================================

delete from public.events
where id in ('evt-1','evt-2','evt-3','evt-4','evt-5','evt-6','evt-7');

-- Conferência: lista o que sobrou no banco (devem ser só os seus eventos reais)
select id, event_name, event_date, artist, vendedor, amount
from public.events
order by event_date;
