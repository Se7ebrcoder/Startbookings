# StartBookings — Plano de Melhorias (auditoria + roadmap)

> Data: 2026-06-19. Escopo: **segurança, design e funções atuais** (sem IA por enquanto).
> Prioridades: **P1** = fazer logo (risco/retorno alto) · **P2** = bom ter · **P3** = depois.

## Resumo executivo

O site está **saudável e seguro** na base (RLS, CSP, hCaptcha, SRI e chave publishable já feitos nesta fase). As melhorias maiores agora **não são de segurança** — são de **experiência (design/UX)** e de **robustez das funções**. Abaixo, o que encontrei e a ordem sugerida.

---

## 🔐 1. Segurança

A maior parte já foi resolvida. O que resta:

- **P1 — Confirmar "Confirm email" LIGADO no Supabase.** É o único risco real em aberto: todo o controle de admin confia no e-mail verificado. (Verificação no painel — não dá pra ver pelo código.)
- **P1 — Mensagens de erro vazam detalhe técnico.** Há ~18 `alert("Erro: " + error.message)` que mostram o erro cru do Supabase ao usuário (ex.: linhas 756, 817, 897 do `app-v2.js`). Trocar por mensagens amigáveis (e logar o detalhe só no console). Melhora UX **e** evita expor internals.
- **P2 — `artist_emails` ainda vazio.** Enquanto não preenchido, artistas logam e veem 0 shows. Preencher quando tiver os e-mails.
- **P2 — Sessão única só funciona p/ admin.** O `session_token` é gravado em `profiles`, mas a policy de update de `profiles` é admin-only → para não-admin a checagem de "logado em outro dispositivo" silenciosamente não faz nada. Decidir: ou remover essa lógica para não-admin, ou ajustar a policy.
- **P3 — Fila de sincronização offline.** Hoje, se um `upsert` no Supabase falha, o dado fica no localStorage mas não sobe (só `console.error`). Uma fila de re-tentativa evita divergência silenciosa.

---

## 🎨 2. Design / Experiência

- **P1 — Substituir os `alert()` nativos por toasts/modais.** Há 18 `alert()` (login, cadastro, erros) contra 54 toasts bonitos já existentes. Os `alert()` quebram a estética e travam a tela. Unificar tudo no sistema de toast/modal que já temos.
- **P1 — Estados de carregamento e vazio.** Hoje os dados carregam e a tela fica vazia até "pipocar". Faltam:
  - **Loading:** um spinner/esqueleto enquanto `loadEventsFromSupabase` etc. rodam.
  - **Vazio:** mensagens tipo *"Nenhum evento ainda — crie o primeiro"* (em Eventos, Clientes, Logística, Financeiro, Kanban).
- **P2 — Responsividade mobile.** O `style.css` tem 9 media queries e as tabelas têm scroll horizontal (`overflow-x:auto`), mas o `styles-login.css` tem **0** media queries e várias telas densas (tabela de eventos, modal do card) merecem um passe de celular. Fazer um QA real em telas pequenas.
- **P2 — Padronizar estilos inline.** O JS gera muito `style="..."` embutido (cores, larguras). Extrair para classes CSS dá consistência visual e facilita um futuro ajuste de tema de uma vez só.
- **P2 — Limpeza de UI morta.** O `#task-modal` (3 referências no `index.html`) ficou órfão depois da reescrita do Kanban — remover. Some também a coluna "LOGÍSTICA" vazia na visão do **artista** (cabeçalho sem célula correspondente).
- **P3 — Acessibilidade.** Base ok (~20 aria/alt/role). Próximos passos: foco preso dentro dos modais, navegação por teclado no Kanban (o drag é só mouse), e checagem de contraste do tema escuro.

---

## ⚙️ 3. Funções atuais

- **P1 — Confiabilidade de datas.** O parsing de data é manual e em vários formatos (vários `if (parts...)`), o que é frágil. Centralizar numa única função de normalização de data, com teste, evita bugs de "data sumiu/trocou".
- **P2 — Modularizar o `app-v2.js` (4.393 linhas).** Um arquivo só dificulta manutenção e aumenta o risco de conflito (já tivemos isso). Como é vanilla sem bundler, dá pra dividir em vários `<script>` por domínio (auth, eventos, clientes, logística, financeiro, kanban, util). Não muda o comportamento — só organiza.
- **P2 — Feedback de sincronização.** Quando algo salva no Supabase, o usuário não sabe se subiu. Um indicador discreto ("salvo ✓" / "sem conexão") aumenta a confiança.
- **P3 — Cobertura de testes.** Há 14 testes (funções puras). Dá pra crescer a verificação automatizada de fluxos de UI (com Playwright, como já usamos nas verificações) para pegar regressões.
- **P3 — Performance de render.** São 58 `innerHTML =` (re-render total). Funciona bem hoje; se a base de eventos crescer muito, vale renderizar incrementalmente.

---

## 🗺️ Ordem sugerida (sprints curtos)

1. ~~**Sprint Segurança+UX rápida (P1):** confirmar "Confirm email"; trocar `alert()` por toasts e mensagens amigáveis; estados de loading/vazio.~~ ✅ **CONCLUÍDO (2026-06-19)** — alerts→toasts + `friendlyAuthError` + loading/vazio. (Falta só você confirmar "Confirm email" no painel.)
2. ~~**Sprint Limpeza+Datas (P1/P2):** remover UI morta (`#task-modal`, coluna vazia do artista); centralizar e testar o tratamento de datas.~~ ✅ **CONCLUÍDO (2026-06-19)** — `normalizeDate()` único e testado; `#task-modal` removido; coluna LOGÍSTICA do artista alinhada (10=10).
3. ~~**Sprint Mobile+Consistência (P2):** QA responsivo (incl. login e modal do card); extrair estilos inline para classes.~~ ✅ **PARCIAL (2026-06-19)** — QA mobile feito (screenshots 390px): login e modal do card já estavam ótimos; **Kanban agora empilha as colunas no celular** e a tabela ficou mais compacta. **Adiados:** redesenho da tabela em "cartões" no mobile (as colunas financeiras ainda exigem rolagem lateral) e a extração de estilos inline (refactor grande/baixo retorno).
4. **Sprint Estrutura (P2/P3):** ~~indicador de sincronização~~ ✅ **FEITO (2026-06-19)** — indicador "✓ Salvo / ⚠ Sem conexão" na topbar, ligado aos saves de eventos, cards, logística e clientes. · **Dividir o `app-v2.js`: ADIADO por recomendação** — alto risco (quebra o app e os testes Jest que carregam o arquivo como módulo único) para benefício só de manutenção (invisível ao usuário). O caminho correto seria adotar ES modules/bundler num projeto dedicado. Não fazer "na marra".
5. **Depois (P3):** ~~acessibilidade avançada~~ ✅ **FEITO (2026-06-21)** — `initModalA11y()`: Esc fecha, foco entra/volta, Tab preso, `role=dialog`/`aria-modal` em todos os modais. · Restam opcionais: fila offline de sync, mais testes de UI, render incremental.

> Cada item vira seu próprio ciclo (desenho → plano → implementação) quando você decidir atacá-lo. Recomendo começar pelo **Sprint 1**, que é o de maior retorno percebido e baixo risco.
