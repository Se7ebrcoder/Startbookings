# Plano de Resposta a Incidentes + Relatório de Impacto (RIPD)

**StartBookings · Versão 1.0 · 30/08/2026**
Base: LGPD Art. 48 (incidentes), Art. 38 (RIPD) e Resolução CD/ANPD nº 15/2024.

---

# Parte I — Plano de Resposta a Incidentes

## Prazo que não se negocia

Incidente de segurança com **risco ou dano relevante** deve ser comunicado à ANPD e
aos titulares em **até 3 (três) dias úteis** contados do conhecimento do fato
(Resolução CD/ANPD nº 15/2024). O relógio começa a correr quando **qualquer pessoa
da equipe** toma ciência — não quando o administrador é avisado.

## Responsáveis

| Papel | Quem | Contato |
|---|---|---|
| Coordenação do incidente | [PREENCHER] | [PREENCHER] |
| Suporte técnico / banco | [PREENCHER] | [PREENCHER] |
| Comunicação com ANPD e titulares | [PREENCHER] | [PREENCHER] |

## Fluxo em 6 passos

### 1. Detectar e registrar (hora zero)
Anote **data e hora do conhecimento** — é dela que se conta o prazo. Fontes típicas:
alerta de acesso suspeito, aviso de terceiro, comportamento anômalo, ou achado de
auditoria.

### 2. Conter (primeiras horas)
- Revogar sessões: `update public.user_sessions set session_token = null;` (derruba todos)
- Trocar a chave publishable no painel do Supabase, se houver suspeita de abuso
- Rotacionar a `service_role` se houver qualquer indício de exposição
- Bloquear a conta comprometida em Authentication → Users
- **Não apague evidências** — preserve `audit_logs` e `login_logs`

### 3. Investigar (24–48h)
Perguntas a responder por escrito:
- Quais **categorias** de dados foram afetadas? Quantos titulares?
- Houve **roteiro de viagem** envolvido? (eleva o risco — ver Parte II)
- O acesso foi de leitura ou também de alteração?
- Consultas úteis:
  ```sql
  select * from public.login_logs order by logged_at desc limit 100;
  select * from public.audit_logs where changed_at > now() - interval '7 days'
   order by changed_at desc;
  ```

### 4. Avaliar o risco
Comunicação à ANPD é obrigatória quando há **risco relevante**. Considere relevante se
houver: dados de localização de artista (hotel/voo), volume significativo de titulares,
possibilidade de dano físico, financeiro ou reputacional, ou dados de menor.

**Na dúvida, comunique.** Comunicar sem necessidade não gera sanção; deixar de
comunicar quando devido, sim.

### 5. Comunicar (até 3 dias úteis)
**À ANPD**, pelo canal oficial, informando: natureza do incidente, categorias de dados e
de titulares, número de afetados, medidas técnicas de proteção já existentes, riscos
identificados, motivo de eventual demora e medidas adotadas.

**Aos titulares**, em linguagem clara: o que aconteceu, quais dados seus foram
afetados, o que já foi feito e o que eles devem fazer (ex.: trocar senha, atenção
redobrada com deslocamentos, se o roteiro vazou).

### 6. Registrar e corrigir
Documente o incidente por completo, implemente a correção e revise este plano. Mantenha
o registro por no mínimo 5 anos.

## Registro de incidentes

| Data | Descrição | Dados afetados | Titulares | ANPD notificada | Encerramento |
|---|---|---|---|---|---|
| — | *Nenhum incidente registrado até a data desta versão* | — | — | — | — |

---

# Parte II — Relatório de Impacto à Proteção de Dados (RIPD)

**Objeto:** tratamento de dados de itinerário de viagem de artistas.
**Motivo:** o Art. 38 da LGPD autoriza a ANPD a exigir RIPD quando o tratamento
apresenta risco elevado. Aqui o risco não é financeiro — é **físico**.

## 1. Descrição do tratamento
O módulo de Logística registra, para cada show: hotel e endereço, datas e horários de
check-in/out, companhia aérea, número do voo, localizador, horários de partida e
chegada, conexões, motorista, modelo e placa do veículo, e ponto de encontro.

## 2. Necessidade e proporcionalidade
O dado é indispensável: sem ele não há como emitir bilhete, reservar hospedagem nem
garantir que o artista chegue ao palco. A finalidade é legítima e a coleta é limitada ao
operacional — **não há** endereço residencial, documento ou dado bancário.

## 3. Riscos identificados

| Risco | Probabilidade | Impacto | Nível |
|---|---|---|---|
| Vazamento de roteiro permite **localizar fisicamente** o artista (perseguição, assédio, furto) | Baixa | **Muito alto** | **Alto** |
| Uso indevido do **localizador** para alterar ou cancelar reserva | Baixa | Alto | **Médio** |
| Acesso interno indevido por usuário sem necessidade | Baixa | Alto | **Médio** |
| Retenção indefinida ampliando a janela de exposição | *Era alta* | Alto | **Mitigado** |
| Compartilhamento indevido do PDF de roteiro exportado | Média | Alto | **Médio** |

## 4. Medidas de mitigação adotadas

| Medida | Situação |
|---|---|
| RLS: logística restrita a Admin e Logística | ✅ Em produção |
| Correção de falha que expunha shows a qualquer conta | ✅ Migração 013 |
| Mascaramento do localizador em D+2 | ✅ Migração 016 |
| Anonimização do roteiro em D+90, preservando valores | ✅ Migração 016 |
| Remoção do roteiro do log de auditoria | ✅ Migração 015 |
| Dever de sigilo contratual sobre roteiros | ✅ Termos de Uso, item 5 |
| Captcha obrigatório e sessão única | ✅ Em produção |
| MFA para Admin | ⏳ A implantar |
| Fechamento do autocadastro | ⏳ A implantar |

## 5. Risco residual e conclusão

Com as medidas acima, o risco residual é **baixo a médio**, concentrado em dois pontos
que dependem de conduta humana: o destino do PDF exportado e o acesso legítimo mal
utilizado. Ambos são endereçados por cláusula de confidencialidade e pelo log de
auditoria.

**Conclusão:** o tratamento é **proporcional e pode prosseguir**, condicionado à
manutenção das medidas listadas e à implantação de MFA para Admin.

## 6. Revisão
Anual, ou a cada mudança relevante no módulo de Logística.

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 30/08/2026 | Elaboração inicial |
