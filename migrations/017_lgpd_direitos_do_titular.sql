-- =====================================================================
--  StartBookings — 017: LGPD — atendimento aos direitos do titular (Art. 18)
--  Requer 001, 004, 005 e 010 já rodadas. SQL Editor → Run. Idempotente.
--
--  RESOLVE o achado do §3 do parecer: hoje os pedidos seriam atendidos
--  "manualmente pelo admin via SQL Editor", o que não escala, não deixa
--  rastro e não cumpre prazo.
--
--  ENTREGA DUAS FUNÇÕES + UM REGISTRO
--   • exportar_dados_titular(nome)  -> atende ACESSO (Art. 18, II e III) e
--     PORTABILIDADE (V), devolvendo tudo em JSON estruturado.
--   • anonimizar_titular(nome)      -> atende ELIMINAÇÃO (VI) na medida em que
--     a lei permite: anonimiza o que pode e PRESERVA o que a obrigação legal
--     manda guardar (Art. 16, I e II), informando o que ficou retido.
--   • titular_solicitacoes          -> registro dos pedidos, que é a prova de
--     conformidade perante a ANPD.
--
--  ⚠️ IMPORTANTE SOBRE ELIMINAÇÃO
--   Apagar tudo seria ILEGAL, não zeloso: nota fiscal, contabilidade e o log
--   de auditoria têm guarda obrigatória. A função anonimiza a identidade e
--   mantém o registro financeiro despersonalizado — que é exatamente o que a
--   LGPD Art. 16 autoriza e o que se deve informar ao titular.
-- =====================================================================

-- =====================================================================
-- 1) REGISTRO DE SOLICITAÇÕES (prova de atendimento)
-- =====================================================================
create table if not exists public.titular_solicitacoes (
  id           bigint generated always as identity primary key,
  criado_em    timestamptz not null default now(),
  titular      text not null,
  tipo         text not null check (tipo in
                 ('acesso','portabilidade','correcao','eliminacao','anonimizacao','revogacao','informacao')),
  canal        text,
  solicitante  text,
  atendido_em  timestamptz,
  resultado    text,
  observacoes  text
);

alter table public.titular_solicitacoes enable row level security;

drop policy if exists "titular_solic_admin" on public.titular_solicitacoes;
create policy "titular_solic_admin" on public.titular_solicitacoes
  for all to authenticated
  using ( (select public.is_admin()) )
  with check ( (select public.is_admin()) );

comment on table public.titular_solicitacoes is
  'LGPD Art. 18: registro de pedidos de titulares. Prazo de resposta: acesso simplificado imediato, declaracao completa em 15 dias (Art. 19).';

-- =====================================================================
-- 2) EXPORTAR — acesso e portabilidade em um único JSON
-- =====================================================================
create or replace function public.exportar_dados_titular(p_nome text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'Apenas administrador pode exportar dados de titular.';
  end if;

  select jsonb_build_object(
    'titular',            p_nome,
    'gerado_em',          now(),
    'base_legal_guarda',  'LGPD Art. 16, I e II — obrigacao legal e exercicio regular de direitos',
    'perfil', (
      select coalesce(jsonb_agg(to_jsonb(p) - 'session_token'), '[]'::jsonb)
        from public.profiles p where p.artist_name = p_nome),
    'vinculo_email', (
      select coalesce(jsonb_agg(to_jsonb(ae)), '[]'::jsonb)
        from public.artist_emails ae where ae.artist_name = p_nome),
    'vinculo_email_booker', (
      select coalesce(jsonb_agg(to_jsonb(be)), '[]'::jsonb)
        from public.booker_emails be where be.booker_name = p_nome),
    'elenco_equipe', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
        from public.roster r where r.name = p_nome),
    'metas', (
      select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
        from public.goals g where g.name = p_nome),
    'shows_como_artista', (
      select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
        from public.events e where e.artist = p_nome),
    'shows_como_vendedor', (
      select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
        from public.events e where e.vendedor = p_nome),
    'logistica', (
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
        from public.logistics l where l.artist = p_nome)
  ) into v_out;

  insert into public.titular_solicitacoes (titular, tipo, canal, resultado)
  values (p_nome, 'acesso', 'painel/SQL', 'Exportacao gerada com sucesso');

  return v_out;
end;
$$;

-- =====================================================================
-- 3) ANONIMIZAR — eliminação até onde a lei permite
-- =====================================================================
create or replace function public.anonimizar_titular(p_nome text, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pseudo   text;
  v_eventos  int := 0;
  v_vendas   int := 0;
  v_logist   int := 0;
  v_roster   int := 0;
  v_emails   int := 0;
  v_metas    int := 0;
begin
  if not public.is_admin() then
    raise exception 'Apenas administrador pode anonimizar titular.';
  end if;

  if not p_confirmar then
    raise exception 'Operacao irreversivel. Chame com p_confirmar => true para executar.';
  end if;

  -- Pseudônimo estável: mesma pessoa gera sempre o mesmo código, o que
  -- preserva a consistência do histórico sem permitir reidentificação.
  v_pseudo := 'TITULAR-' || upper(substr(md5(p_nome), 1, 8));

  -- Vínculos de login: eliminados (não há obrigação de guarda)
  delete from public.artist_emails where artist_name = p_nome;
  get diagnostics v_emails = row_count;
  delete from public.booker_emails where booker_name = p_nome;

  -- Elenco/equipe e metas: eliminados
  delete from public.roster where name = p_nome;
  get diagnostics v_roster = row_count;
  delete from public.goals  where name = p_nome;
  get diagnostics v_metas = row_count;

  -- Perfil: desvincula o nome (a conta de login em auth.users é removida à parte)
  update public.profiles set artist_name = null where artist_name = p_nome;

  -- Logística: anonimiza o roteiro por completo (nenhuma obrigação de guarda)
  update public.logistics
     set artist = v_pseudo,
         data = jsonb_build_object('anonimizado_em', to_jsonb(now()))
   where artist = p_nome;
  get diagnostics v_logist = row_count;

  -- Shows: PRESERVADOS com identidade substituída — a guarda do registro
  -- financeiro decorre de obrigação legal (LGPD Art. 16, I).
  update public.events set artist   = v_pseudo where artist   = p_nome;
  get diagnostics v_eventos = row_count;
  update public.events set vendedor = v_pseudo where vendedor = p_nome;
  get diagnostics v_vendas = row_count;

  insert into public.titular_solicitacoes (titular, tipo, canal, atendido_em, resultado, observacoes)
  values (p_nome, 'anonimizacao', 'painel/SQL', now(),
          'Anonimizado como ' || v_pseudo,
          'Shows preservados de forma despersonalizada por obrigacao legal (LGPD Art. 16, I).');

  return jsonb_build_object(
    'titular_original',      p_nome,
    'pseudonimo',            v_pseudo,
    'eliminado', jsonb_build_object(
        'vinculos_email', v_emails, 'elenco_equipe', v_roster,
        'metas', v_metas, 'roteiros_de_viagem', v_logist),
    'preservado_despersonalizado', jsonb_build_object(
        'shows_como_artista', v_eventos, 'shows_como_vendedor', v_vendas),
    'informar_ao_titular',
      'Os registros financeiros dos shows foram mantidos de forma despersonalizada, '
      || 'com base na LGPD Art. 16, I (cumprimento de obrigacao legal fiscal/contabil). '
      || 'Nome, contatos, vinculos de acesso e roteiros de viagem foram eliminados.',
    'acao_manual_pendente',
      'Excluir a conta de login correspondente em Authentication > Users, se houver.'
  );
end;
$$;

revoke all on function public.exportar_dados_titular(text)        from public, anon;
revoke all on function public.anonimizar_titular(text, boolean)   from public, anon;
grant execute on function public.exportar_dados_titular(text)      to authenticated;
grant execute on function public.anonimizar_titular(text, boolean) to authenticated;
-- (a checagem de is_admin() dentro das funções é a barreira efetiva)

-- =====================================================================
-- 4) COMO USAR
-- =====================================================================
-- Exportar (acesso/portabilidade):
--   select public.exportar_dados_titular('Se7e');
--
-- Anonimizar (eliminação) — exige confirmação explícita:
--   select public.anonimizar_titular('Se7e', true);
--
-- Consultar o histórico de pedidos:
--   select * from public.titular_solicitacoes order by criado_em desc;

-- =====================================================================
-- 5) CONFERÊNCIA
-- =====================================================================
select routine_name
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('exportar_dados_titular','anonimizar_titular')
 order by routine_name;
