# Auditoria de Segurança — StartBookings — 29/08/2026

**Alvo:** `startbookings.vercel.app` + Supabase (`jijjacpgbnubamawbscw`)
**Escopo:** RLS de 13 tabelas, endpoints REST/RPC/auth/storage/GraphQL, código do
frontend (XSS, segredos), cabeçalhos HTTP, dependências.
**Método:** caixa-preta (API pública, sem login) + caixa-branca (código e as 13 migrações).
Executada sobre sistema próprio, com autorização.

## Veredito

O perímetro externo está **bem defendido**: nada vaza sem login, brute-force é barrado
pelo captcha obrigatório no servidor, não há segredo no bundle. O risco real é
**interno e de autorização**: com o cadastro aberto, qualquer pessoa podia criar conta e —
por uma comparação com string vazia — **ler shows sem artista e alterar shows sem vendedor**.

| Severidade | Qtd |
|---|---|
| 🔴 Crítico | 1 |
| 🟠 Alto | 1 |
| 🟡 Médio | 2 |
| ⚪ Baixo | 2 |
| 🔵 Informativo | 1 |
| ✅ Testes aprovados | 17 |

---

## SB-01 · CRÍTICO — Comparação com string vazia libera shows para qualquer conta

**✅ CORRIGIDO (30/08/2026) — migração `013` aplicada.** A conferência no banco retornou
`shows_sem_artista = 0` e `shows_sem_vendedor = 0`: a falha era **latente**, nenhum dado
chegou a ser exposto.

As policies de `events` comparam `artist = current_artist_profile()` e
`vendedor = current_booker_name()`. Ambas as funções retornam `''` para quem não tem
perfil (`coalesce(..., '')`), e o app grava `''` — não NULL — quando o show está sem
artista/vendedor (`js/data/events.repo.js`: `ev.artist || ""`). Como `'' = ''` é
verdadeiro, a policy casa por acidente.

Impacto: qualquer autenticado **lê** todo show sem artista/vendedor e **altera** todo show
sem vendedor (a policy de `update` tem a mesma brecha). Como o signup é aberto (SB-05),
vale para qualquer pessoa da internet que crie conta.

Correção: exigir campo e perfil não-vazios (`nullif` + guarda explícita) antes de comparar.

## SB-02 · ALTO — E-mails dos artistas colhíveis sem login

**✅ CORRIGIDO (30/08/2026).** Decisão: login sempre por e-mail. Frontend publicado e
migração `014` dropou a função. Reteste externo: os nomes que devolviam e-mails agora
retornam `PGRST202 — função não encontrada`.

`resolve_login_email` precisa ser chamável por `anon` (roda antes do login). Como nomes
artísticos são públicos, qualquer um converte a lista de artistas em lista de e-mails
pessoais. Confirmado na prática: 7 e-mails reais obtidos anonimamente; nome inexistente
retorna `null`, servindo de oráculo.

Relevante para LGPD e insumo para phishing dirigido. **Imune a SQL injection** (testado
com aspas, `--`, `%`, `_` — parametrizada e com igualdade exata).

Opções: **(a)** revogar de `anon` e exigir login por e-mail (recomendado); **(b)** aceitar
o risco conscientemente.

## SB-03 · MÉDIO — Metas financeiras visíveis para qualquer logado

**✅ CORRIGIDO — migração `013`.** Achado de autoria própria (introduzido na 010 ao
consertar a perda de dados). `goals` (meta anual de faturamento) estava com
`using (true)`. Passa a ser admin + no máximo a própria linha.

## SB-04 · MÉDIO — Elenco e equipe completos legíveis por qualquer conta

**✅ CORRIGIDO — migração `013`.** Mesma origem do SB-03: `roster` com `using (true)`.
Combinado com signup aberto, entrega o mapa comercial da agência. Passa a exigir papel
interno (admin/booker/logística). Artistas não quebram: o app deriva nomes dos próprios
shows e usa cor padrão.

## SB-05 · BAIXO — Cadastro aberto  ⚠️ RISCO ACEITO

`disable_signup: false`. Sozinho é pouco (confirmação de e-mail + captcha ativos), mas era
a conta que transformava SB-01/03/04 em risco da internet inteira. Com a 013 aplicada o
estrago fica contido; ainda assim, considerar fechar o signup e criar contas manualmente.

## SB-06 · BAIXO — `js-yaml` com 2 CVEs altos (dependência de teste)  ⚠️ RISCO ACEITO

Puxado pelo Jest. **Não afeta o site** (nunca chega ao navegador). Dependências de
produção: **zero** vulnerabilidades. **Não é corrigível sem quebrar a ferramenta:** `npm audit fix` falha por conflito de peer
dependency e o override para a v4 quebra o `@istanbuljs/load-nyc-config`, que usa a API
`safeLoad` removida na v4. Aceito como risco residual.

## SB-07 · INFORMATIVO — `Access-Control-Allow-Origin: *` nos estáticos

Inofensivo: arquivos já são públicos e não há cookie/sessão nessa origem. Sem ação.

---

## Testes aprovados (17)

Leitura anônima (13 tabelas → vazio) · escrita anônima (401 RLS) · enumeração de schema
(recusada) · GraphQL (desativado) · storage (sem buckets) · brute-force (captcha antes da
senha) · login anônimo (off) · confirmação de e-mail (on) · SQL injection (imune) · XSS
(64 sinks, todos escapados) · segredos no bundle (nenhum) · PII no código (nenhuma) ·
arquivos sensíveis (.env/.git/migrations → 404) · cabeçalhos (CSP/HSTS/XFO/nosniff) ·
audit_logs (imutável pelo cliente) · demais tabelas (sem a falha do SB-01) ·
dependências de produção (zero CVEs).

## Encerramento (30/08/2026)

Todos os achados tratados. 4 corrigidos e verificados em produção, 2 aceitos com
justificativa, 1 sem ação necessária.

| Achado | Situação |
|---|---|
| SB-01 crítico | ✅ Corrigido (013) — era latente, 0 shows expostos |
| SB-02 alto | ✅ Corrigido (014 + login por e-mail) |
| SB-03 / SB-04 médios | ✅ Corrigidos (013) |
| SB-05 baixo | ⚠️ Risco aceito — contido pela 013 |
| SB-06 baixo | ⚠️ Risco aceito — sem correção viável |
| SB-07 informativo | Sem ação |

**Pendência humana:** avisar artistas/bookers que o login agora é por e-mail.

**Varredura final de regressão (30/08):** 13 tabelas anônimas vazias · escrita anônima 401 ·
RPCs restantes inócuas (`is_admin` false, perfis vazios) · captcha ainda obrigatório no login.

> Relatório visual: publicado como artifact em 29/08/2026.
> Auditoria anterior: `docs/auditoria-seguranca-2026-07-04.md`.
