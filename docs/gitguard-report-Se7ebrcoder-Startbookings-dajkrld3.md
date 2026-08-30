# Relatório de Segurança — Se7ebrcoder/Startbookings

**Scan:** `cmskdsmdq01kbbh40dajkrld3` · MANUAL · branch `main` · commit `b1d82129b73f`
**Status:** COMPLETED · **Executado em:** 2026-08-08T13:00:11.131Z · **Concluído em:** 2026-08-08T13:02:30.008Z
**Relatório gerado em:** 2026-08-08T13:03:26.811Z por GitGuard

## Instruções para a IA que for corrigir isto

- Repositório alvo: Se7ebrcoder/Startbookings, branch "main", commit b1d82129b73f98f64e8fedc388a178fa0646ff55. Aplique as correções diretamente nesse checkout.
- Em "dependencyUpgrades", cada entrada agrupa TODOS os CVEs de um mesmo pacote — faça UM upgrade por pacote (para "recommendedVersion" ou mais recente), não uma correção por CVE.
- Em "secrets", nunca tente adivinhar ou reconstruir o valor original do segredo (ele foi propositalmente redigido) — apenas remova/rotacione conforme "remediation".
- Depois de aplicar as correções, rode os testes existentes do projeto e, se disponível, o linter/build antes de considerar concluído.

## Resumo

- **Total de findings:** 14
- **Por severidade:** HIGH: 2 · MEDIUM: 11 · LOW: 1
- **Por scanner:** GITLEAKS: 2 · SEMGREP: 12

## Segredos expostos

### 🔑 js/core/supabase.js:23 — Secret detected: Detected a Generic API Key, potentially exposing access to various services and sensitive operations. (HIGH)

Regra: `generic-api-key`

**Remediação:** Remova o valor do código-fonte e mova para uma variável de ambiente / secret manager. Se for uma credencial real (não um placeholder de exemplo), revogue-a imediatamente — ela já está exposta no histórico do Git mesmo após removida do arquivo atual.

### 🔑 js/core/supabase.js:40 — Secret detected: Detected a Generic API Key, potentially exposing access to various services and sensitive operations. (HIGH)

Regra: `generic-api-key`

**Remediação:** Remova o valor do código-fonte e mova para uma variável de ambiente / secret manager. Se for uma credencial real (não um placeholder de exemplo), revogue-a imediatamente — ela já está exposta no histórico do Git mesmo após removida do arquivo atual.

## Outros findings

| Severidade | Scanner | Categoria | Título | Local |
|---|---|---|---|---|
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/features/events/table.js:482 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/features/clients/modal.js:73 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/features/events/modal.js:178 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/features/events/modal.js:231 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.html.security.audit.missing-integrity.missing-integrity | /scan/index.html:35 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/data/logistics.repo.js:74 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/features/events/table.js:741 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/features/logistics/form.js:82 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.typescript.react.security.audit.react-unsanitized-method.react-unsanitized-method | /scan/js/features/logistics/form.js:230 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/features/logistics/view.js:100 |
| MEDIUM | SEMGREP | SAST | Semgrep Finding: rules.ajinabraham.njsscan.crypto.crypto_node.node_insecure_random_generator | /scan/js/utils/dom.js:40 |
| LOW | SEMGREP | SAST | Semgrep Finding: rules.javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring | /scan/js/core/supabase.js:58 |

## Status da correção (08/08/2026)

| Finding | Ação | Onde |
|---|---|---|
| HIGH · segredo em `supabase.js:23` (chave Supabase) | **Falso positivo documentado.** É a chave *publishable* (`sb_publishable_`), pública por design — o supabase-js precisa dela no navegador. Movida para `js/core/env.js`, com anotação `gitleaks:allow`, explicação e ponto único de rotação/override por ambiente (`window.__SB_PUBLIC_ENV__`). A proteção real continua sendo o RLS. A `service_role` key nunca esteve no repo. | `js/core/env.js`, `js/core/supabase.js` |
| HIGH · segredo em `supabase.js:40` (hCaptcha) | **Falso positivo documentado.** É a *sitekey* do hCaptcha, que por definição vai no HTML do widget. Mesmo tratamento acima. O *secret* do hCaptcha vive só no painel do Supabase. | `js/core/env.js` |
| MEDIUM · `node_insecure_random_generator` (8 ocorrências) | **Corrigido.** `Math.random()` na geração de IDs (`evt-`, `cli-`, `log-`, `lgrp-`) e no sorteio de cor substituído por `crypto.getRandomValues` via novo módulo `js/utils/id.js` (`newId`, `randomHex`, `randomInt`, `randomPick`, este último sem viés de módulo). Formato dos IDs preservado. | `js/utils/id.js` + 7 arquivos |
| MEDIUM · `missing-integrity` em `index.html:35` | **Não aplicável, documentado no HTML.** `js.hcaptcha.com/1/api.js` é loader mutável: fixar SRI derruba o captcha (e o login) no próximo build deles. Mitigação: CSP com `script-src` restrito a `*.hcaptcha.com` + `referrerpolicy`. Chart.js e supabase-js, com URL de versão imutável, já tinham SRI. | `index.html`, `vercel.json` |
| MEDIUM · `react-unsanitized-method` em `form.js:230` | **Corrigido.** `insertAdjacentHTML` trocado por `<template>` + `appendChild` (o markup já era estático/escapado por `escapeHtml`). | `js/features/logistics/form.js` |
| LOW · `unsafe-formatstring` em `supabase.js:58` | **Corrigido.** Concatenação no 1º argumento do `console.error` trocada por argumentos separados. | `js/core/supabase.js` |

Verificação: `npm test` → 5 suítes / 39 testes verdes (5 testes novos cobrindo `js/utils/id.js`).
