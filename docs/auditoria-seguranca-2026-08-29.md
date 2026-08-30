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

**Correção pronta: migração `013`.**

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

**Decisão pendente (muda o fluxo de login).**

`resolve_login_email` precisa ser chamável por `anon` (roda antes do login). Como nomes
artísticos são públicos, qualquer um converte a lista de artistas em lista de e-mails
pessoais. Confirmado na prática: 7 e-mails reais obtidos anonimamente; nome inexistente
retorna `null`, servindo de oráculo.

Relevante para LGPD e insumo para phishing dirigido. **Imune a SQL injection** (testado
com aspas, `--`, `%`, `_` — parametrizada e com igualdade exata).

Opções: **(a)** revogar de `anon` e exigir login por e-mail (recomendado); **(b)** aceitar
o risco conscientemente.

## SB-03 · MÉDIO — Metas financeiras visíveis para qualquer logado

**Correção pronta: migração `013`.** Achado de autoria própria (introduzido na 010 ao
consertar a perda de dados). `goals` (meta anual de faturamento) estava com
`using (true)`. Passa a ser admin + no máximo a própria linha.

## SB-04 · MÉDIO — Elenco e equipe completos legíveis por qualquer conta

**Correção pronta: migração `013`.** Mesma origem do SB-03: `roster` com `using (true)`.
Combinado com signup aberto, entrega o mapa comercial da agência. Passa a exigir papel
interno (admin/booker/logística). Artistas não quebram: o app deriva nomes dos próprios
shows e usa cor padrão.

## SB-05 · BAIXO — Cadastro aberto

`disable_signup: false`. Sozinho é pouco (confirmação de e-mail + captcha ativos), mas era
a conta que transformava SB-01/03/04 em risco da internet inteira. Com a 013 aplicada o
estrago fica contido; ainda assim, considerar fechar o signup e criar contas manualmente.

## SB-06 · BAIXO — `js-yaml` com 2 CVEs altos (dependência de teste)

Puxado pelo Jest. **Não afeta o site** (nunca chega ao navegador). Dependências de
produção: **zero** vulnerabilidades. Resolver com `npm audit fix`.

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

## Plano de ação

1. **AGORA** — rodar `migrations/013_corrige_rls_string_vazia.sql` no Supabase (fecha SB-01, SB-03, SB-04).
2. **Esta semana** — decidir SB-02 (login por e-mail vs. nome artístico).
3. **Esta semana** — `npm audit fix` (SB-06).
4. **Planejar** — avaliar fechar o cadastro (SB-05).

> Relatório visual: publicado como artifact em 29/08/2026.
> Auditoria anterior: `docs/auditoria-seguranca-2026-07-04.md`.
