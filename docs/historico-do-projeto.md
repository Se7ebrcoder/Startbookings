# StartBookings — Histórico do Projeto (diário de evolução)

> Registro legível do que foi construído nas nossas conversas, para você não perder o histórico.
> Atualizado em 2026-06-12.

## 🔐 1. Segurança (Supabase)
- **Chave vazada:** a `service_role` (e a `anon` JWT legada) tinham vazado. Substituímos pela chave **publishable** (`sb_publishable_...`) no `app-v2.js` e as chaves legadas foram desativadas no painel.
- **RLS (Row Level Security):** ativado na tabela `events`. Verificado: sem login, a API retorna `[]`.
- **Escalonamento de admin:** corrigido com `supabase_profiles_setup.sql` — tabela `profiles` (papel por usuário, só admin edita), `artist_emails` (mapa controlado pelo admin), trigger no cadastro e `is_admin()` por e-mail verificado (não mais por metadado editável).
- Arquivos removidos: `test_insert.js`, `test_insert_anon.js` (continham a chave vazada).
- **Pendente:** preencher `artist_emails` quando tiver os e-mails dos artistas.

## 🎨 2. Avaliação geral + correções iniciais
- Anti-XSS (escapeHtml) na tabela, timeline, kanban e dropdowns.
- Correção da ordenação da tabela (delegação de eventos + setas ▲▼).
- Persistência do Kanban no localStorage.
- Menu hambúrguer para celular (a navegação sumia no mobile).
- Acessibilidade: navegação por teclado, aria-labels, foco visível, `prefers-reduced-motion`.
- Removidos: modal `confirm-modal` duplicado, telas mortas de OTP; recuperação de senha ligada ao Supabase.
- Correção do bug "dados de exemplo que voltavam" (mocks deixaram de ser semeados/re-enviados; o banco virou a fonte de verdade no login).

## 👥 3. Módulo de Clientes
- Tabela `clients` no Supabase (com RLS, só admin) + coluna `client_id`/`contract_status` em `events`.
- Aba "Clientes" (acima de Eventos), lista em acordeão com histórico de produções (line-up, contrato, pagamento).
- Criação rápida de cliente dentro do modal de evento; cliente "A definir" para eventos antigos.
- Pagamento (cachet) derivado automaticamente (Pendente/Sinal Pago/Totalmente Pago).
- Contrato por evento, editável na tabela via dropdown moderno (mesmo estilo das tags).
- Specs/planos: `docs/superpowers/specs/2026-06-11-gestao-clientes-design.md`, `docs/superpowers/plans/2026-06-11-gestao-clientes.md`.

## 🚚 4. Módulo de Logística
- **Fase 1:** cargo `Logistica` (vê só a aba Logística), `logistics_emails`, `is_logistics()`, `logistics_events()` (RPC sem financeiro), tabela `logistics` (JSONB) + RLS. Dashboard (KPIs + alerta ≤7 dias), criação em cascata (evento→artistas), formulário (hospedagem + ida/volta carro/uber/avião + conexões), rascunho/finalizar, desmembrar, status por artista na tabela.
- **Fase 2:** modal "Ver Logística" read-only (não fecha ao clicar fora) + "Exportar PDF" (impressão limpa via `@media print`).
- Specs/planos: `docs/superpowers/specs/2026-06-11-logistica-design.md`, `docs/superpowers/plans/2026-06-11-logistica-fase1.md` e `...-fase2.md`.
- **Pendente:** preencher `logistics_emails` (Aline = `alinejanau17@gmail.com` já registrada; falta ela criar a conta).

## ✨ 5. Ajustes de interface
- Aviso central (toast): ícone dourado sólido corrigido (estava transparente).
- Alinhamento do cabeçalho do evento (Cliente/Contrato alinhados aos demais campos).
- Seletor de cor das tags (artistas/equipe): trocado por seletor nativo com **paleta completa** (antes só 12 cores fixas).

## 🔒 6. Auditoria de segurança + CAPTCHA + CSP (2026-06-12)
- **Auditoria completa (testada de fora):** sem login, a API retorna `[]` em todas as tabelas (`events`, `clients`, `logistics`, `profiles`, `artist_emails`, `logistics_emails`) e o INSERT anônimo é bloqueado (401). RPCs (`logistics_events`, `is_admin`) retornam vazio/false para anônimo. Nenhuma chave secreta no código (só a publishable). XSS coberto por `escapeHtml`. Papel "Booker" no JS é cosmético — o RLS é o portão real.
- **Pendente de configuração (painel):** confirmar **"Confirm email" LIGADO** (senão alguém poderia se cadastrar como `admin@startbookings.com` e virar admin).
- **Bibliotecas externas travadas + SRI:** Supabase fixado em `2.108.1` (via `unpkg`, com hash de integridade) e Chart.js `4.4.1` com hash. Se o CDN for adulterado, o navegador recusa o script.
- **hCaptcha (anti-bot) integrado:** widget "Não sou um robô" nas telas de login, cadastro e recuperação de senha; token enviado ao Supabase em cada ação; reset após cada tentativa; aviso amigável se não resolver. Site key (pública) no `app-v2.js`; secret key (`ES_…`) fica **só no Supabase** (Attack Protection).
- **CSP ajustada (`vercel.json`):** liberados `https://hcaptcha.com` e `https://*.hcaptcha.com` em `script-src`, `style-src`, `connect-src` e na nova diretiva `frame-src` (o widget é um iframe). Supabase voltou ao `unpkg` (já permitido) para não precisar liberar outro CDN.
- **⚠️ Importante:** CSP e arquivos só valem **após deploy no Vercel**. Testar o login no domínio real (`startbookings.vercel.app`), não no `localhost` (o hCaptcha recusa host não autorizado).

## 💰 7. Aba Financeiro — valores de logística (2026-06-19)
- Nova aba **Financeiro** (só admin), acordeão por evento, onde se define o **valor em R$** da logística de cada artista conforme o modo (gasolina, passagem ida/volta de avião/ônibus/BlaBlaCar, uber, hospedagem). Valores ficam no mesmo JSONB da logística (`ida.valor`, `volta.valor`, `hotel.valor`) — **sem mudar o banco**. Salva automático.
- **Tabela de eventos** ganhou as colunas **Cachê → Log.(R$) → Total → A Receber**: `Total = Cachê + Logística` e `A Receber = Total − Recebido` (Modelo A — o cliente paga a logística). Cachê e Recebido editáveis; o resto é automático. Helper puro `getLogisticsCost` com testes Jest.
- Meta/faturamento do painel continua só com o cachê (logística é reembolso).
- **Booker editável (etapa de segurança separada):** script `supabase_booker_setup.sql` torna "Booker" um papel real em `profiles` + RLS para o booker **ler/editar só os shows que ele vendeu** (não vê os de outros bookers, não exclui). **Pendente:** rodar esse script no Supabase.
- Specs/planos: `docs/superpowers/specs/2026-06-19-financeiro-logistica-design.md`, `docs/superpowers/plans/2026-06-19-financeiro-logistica.md`.

## 🗂️ 8. Kanban de Eventos (2026-06-19)
- O Kanban virou painel de **eventos**: **1 card por evento**, criado automático ao criar o evento, com **checklist padrão de 7 etapas**. Cards e checklist ficam no **Supabase** (tabela nova `event_cards`, RLS **admin-only**) — script `supabase_kanban_setup.sql`. O Kanban antigo (localStorage, tarefas genéricas) foi aposentado.
- **Quadro:** 3 colunas (A Fazer/Em Andamento/Concluído), card com **barra de progresso** (feitos/total) e sino de lembrete; arrastar salva a coluna.
- **Card aberto:** editor completo do evento (data, local, estado, cliente, contrato) + **line-up** (cachê/status, adicionar/remover artista) + **checklist** (marcar/adicionar/remover) + **excluir card**. Reaproveita `saveState()` (que já sincroniza eventos).
- **Lembrete estilo alarme:** cada card tem data + **interruptor liga/desliga**. Quando ligado, no **login** (e ao abrir o Kanban) aparece o **aviso central** listando os "a fazer" **atrasados** (vermelho) e **chegando ao fim** (≤3 dias, amarelo). Desligar o interruptor para de avisar.
- **Acesso:** só admin (nav escondido + RLS). Funções puras testadas (Jest, 14/14).
- **Pendente:** rodar `supabase_kanban_setup.sql` no Supabase + deploy no Vercel.
- Specs/planos: `docs/superpowers/specs/2026-06-19-kanban-eventos-design.md`, `docs/superpowers/plans/2026-06-19-kanban-eventos.md`.

## ✨ 9. Sprint 1 de melhorias — UX (2026-06-19)
- **Mensagens de erro amigáveis:** os 18 `alert()` nativos foram substituídos pelo sistema de toast. Erros do Supabase/rede agora viram texto amigável (`friendlyAuthError`, testado) e o detalhe técnico vai só pro console — ex.: "Invalid login credentials" → **"E-mail ou senha incorretos."**. Toast de erro é vermelho e fica até fechar; sucessos em verde; toasts agora aparecem **por cima da tela de login** (z-index). O aviso "conta conectada em outro dispositivo" virou bloqueante antes do reload.
- **Estados de carregando e vazio:** spinner central enquanto os dados carregam no login; mensagens amigáveis quando uma aba está vazia (Eventos, Clientes, Logística, Financeiro, Kanban) — ex.: *"Nenhum evento ainda — clique em + Novo Evento para começar."*.
- Verificado no navegador (toast sobre o login, loading, vazio) + 15/15 testes Jest. Versões: style.css?v=15, app-v2.js?v=28.
- Roadmap completo em `docs/2026-06-19-plano-melhorias.md`.

## 🧹 10. Sprint 2 de melhorias — Limpeza + Datas (2026-06-19)
- **Datas centralizadas:** os dois blocos duplicados de parsing de data viraram uma função única `normalizeDate(input)` (DD/MM/AAAA, DD-MM-AAAA, AAAA-MM-DD, DDMMAAAA... → canônico `AAAA-MM-DD`), com testes que travam o comportamento. Refactor sem mudança de comportamento.
- **Limpeza de UI morta:** removido o modal órfão `#task-modal` (sobra do Kanban antigo) e alinhada a coluna "LOGÍSTICA" que aparecia vazia na visão do **artista** (cabeçalho agora condicional — 10 colunas = 10 células).
- Verificado (navegador: header=linha, normalizeDate ok, sem erros) + 16/16 testes Jest. Versão: app-v2.js?v=29.

## 📱 11. Sprint 3 de melhorias — Mobile (2026-06-19)
- **QA mobile real** (screenshots em 390px): login e modal do card já estavam ótimos. Ajustes via CSS (`@media max-width:768px`): **Kanban empilha as colunas verticalmente** no celular (antes só 1 cabia, com scroll lateral) e a **tabela de eventos** ficou mais compacta (padding/inputs menores + scroll suave).
- **Adiados (registrados no roadmap):** redesenho da tabela em "cartões" no mobile (colunas financeiras ainda exigem rolagem lateral) e a extração de estilos inline para classes (refactor grande, baixo retorno). Versão: style.css?v=16.

## 💾 12. Sprint 4 de melhorias — Indicador de sincronização (2026-06-19)
- **Indicador "✓ Salvo / ⚠ Sem conexão"** na topbar (`#sync-status`): após cada gravação no Supabase aparece "✓ Salvo" (verde, some em ~2s) ou "⚠ Sem conexão (salvo no aparelho)" (vermelho) se a sincronização falhar. Ligado aos saves de eventos (`saveState`), cards do Kanban, logística e clientes. Verificado no navegador + 16/16 testes. Versões: app-v2.js?v=30, style.css?v=17.
- **Divisão do `app-v2.js` em vários arquivos: ADIADA por recomendação** — alto risco (pode quebrar o app e os testes Jest, que carregam o arquivo como módulo único) para um benefício só de manutenção (invisível ao usuário). O correto seria adotar ES modules/bundler num projeto dedicado, não fazer "na marra".

## ♿ 13. Sprint 5 de melhorias — Acessibilidade dos modais (2026-06-21)
- **UX/acessibilidade de modais** via helper central `initModalA11y()` (sem editar cada modal): **Esc fecha** o modal aberto, o **foco entra** no modal ao abrir e **volta** ao elemento anterior ao fechar, **Tab fica preso** dentro do modal, e cada `.modal-overlay` ganhou `role="dialog"` + `aria-modal="true"`. Funciona em todos os modais (usam `.modal-overlay` + classe `show`).
- Verificado no navegador (aria, foco, Esc) + 16/16 testes. Versão: app-v2.js?v=31.
- **Demais itens do S5 (opcionais, não feitos):** fila offline de re-sincronização, mais testes de UI, render incremental — o usuário priorizou a acessibilidade.

## 🐞 14. Correção — aba Financeiro em branco (2026-06-21)
- **Sintoma:** a aba Financeiro abria totalmente vazia (nem dados, nem a mensagem "Nenhum evento"). Eventos/Clientes funcionavam → não era permissão.
- **CAUSA-RAIZ REAL:** a seção `#financeiro-view` no `index.html` tinha um `style="display:none;"` **inline**. As views são exibidas via classe `.active-view` (CSS), mas o estilo inline **vence a classe** → a seção ganhava a classe ativa porém continuava escondida. O conteúdo era renderizado (diagnóstico no cliente mostrou ~4685 caracteres no `#financeiro-list`), só não aparecia. **Correção:** removido o `style="display:none;"` inline (a classe `.view-section` já esconde por padrão). Verificado pelo **caminho real** (clicar na aba → seção `display:block`, visível).
- **Lição de verificação:** o bug passou batido porque as checagens anteriores chamavam `renderFinanceiroView()` direto / forçavam o display, em vez de testar o clique→visível. Passar a testar o caminho real de navegação.
- **Bônus (fix defensivo separado):** no mesmo dia, `escapeHtml`/`formatDate` foram blindados p/ não quebrar com `null`/`undefined`/número (evita telas em branco por valor inesperado em qualquer aba). Teste de regressão add (17/17). Versão JS: app-v2.js?v=32; a correção da seção é no index.html.

## 🎨 15. Redesign premium — Financeiro + Modal do card (2026-06-21)
- **Aba Financeiro** redesenhada (frontend-design): resumo no topo (Eventos + Total em ouro), cards de vidro por evento com barra dourada lateral e total em gradiente ouro, **chips coloridos por artista** (cor da tag), e trechos como **itens de fatura** com ícones por modo (✈️🚌⛽🚗🚕🏨) e tag IDA/VOLTA/EST. Inputs de R$ com foco dourado. Estado vazio estilizado.
- **Modal do card (Kanban)** redesenhado: header com fonte display + risco dourado; seções rotuladas (Dados/Line-up/Checklist/Lembrete); line-up com chips + cachê com prefixo R$ + status; **checklist com barra de progresso dourada e checkboxes douradas customizadas** (item feito riscado); interruptor de lembrete em gradiente ouro; rodapé com Salvar (ouro) + Excluir.
- **Coesão:** usa os tokens existentes (`--gold-gradient`, `--bg-card` vidro, `--font-display` Bricolage, sombras). **Todos os ganchos preservados** (`data-rec`/`.fin-value-input`, `.card-check`/`.card-cachet`/`#card-save-btn`...). Verificado VISUAL (screenshots) e FUNCIONAL (marcar checklist, editar cachê, salvar valor de logística → toast) + 17/17 testes.
- **Ajustes pós-feedback (v=34/v=19):** (1) no line-up do modal, cada artista mostra a ramificação **Cachê + Logística = Total** (logística vem do Financeiro, total reflete na tabela de eventos via cachê editável); (2) dropdowns Pré/Pós e Cliente/Contrato com `color-scheme: dark` (popup escuro, padrão do sistema); (3) corrigido o "embolado" da Financeiro — removida a classe herdada `inline-edit-input` (forçava `width:100%`) + label com ellipsis + input com `margin-left:auto` e mais respiro.
- **Logística editável pelo Kanban (v=35/v=20):** dentro do card, cada artista agora tem editor da logística — **escolher o modo** (Avião/Ônibus/Carro/Uber/Táxi/BlaBlaCar) e o **valor** de IDA e VOLTA, mais liga/desliga + valor da **Hospedagem**. Edita o MESMO registro `logistics` da aba Logística (helper `getOrCreateLogistics` cria o registro se não existir) e reflete no total do card, na tabela de eventos e no Financeiro. Os detalhes operacionais de viagem (horários/motorista/placa) seguem na aba Logística. Verificado funcional (criar registro, salvar modo/valor, ligar hospedagem) + 17/17 testes.
- **Dropdowns do card padronizados (v=36/v=21):** os seletores nativos de **modo de logística** e **Pré/Pós** no card viraram o **dropdown customizado do site** (helper `openCardSelect` reaproveitando o visual `.custom-popover` do `styles-login.css`, z-index 1000 acima do modal). Acabou o menu nativo do SO com realce azul; agora é dark, arredondado, com ícones e hover, igual às tags da tabela de eventos. (Cliente/Contrato seguem como select nativo com `color-scheme:dark` — podem virar custom também se desejado.) Versões finais: app-v2.js?v=36, style.css?v=21.

## 🔒 16. Auditoria + quick wins de segurança (2026-06-22)
- **Auditoria técnica** completa do sistema (relatório de verificações e melhorias) e criação do **prompt-base reutilizável** em `docs/prompt-engenharia-startbookings.md` (contexto real da stack, perfis e pendências já embutidos).
- **Quick wins aplicados (v=37):**
  - **Logs (S3/S4):** adicionada flag `SB_DEBUG` (liga com `?debug=1` na URL ou `localStorage.sb_debug="1"`) + helper `dbg()`. O `console.log` que vazava o **e-mail do usuário** no login agora só aparece em modo debug. `console.error` de erros reais mantidos (úteis p/ suporte).
  - **Senha mínima 8 (S6):** cadastro agora valida `password.length < 8` (antes não validava no cliente) e a redefinição subiu de 6→8. Mensagem de erro do Supabase deixou de fixar "6". *(Recomendado também ajustar o mínimo p/ 8 no painel do Supabase → Auth.)*
  - **Sessão única (S7):** troca de `window.confirm` (bloqueante/feio) por `showWarningToast` + reload após 2,5s ao detectar login em outro dispositivo.
- Verificado: **17/17 testes** (teste de `friendlyAuthError` atualizado p/ 8 caracteres). Versão: app-v2.js?v=37 (CSS inalterado, segue v=21). **Pendente: deploy.**
- **Pendências mapeadas para próximas fases:** auditoria (`audit_logs`/`login_logs`), paginação das queries `.select('*')`, remover `'unsafe-inline'` da CSP (só 7 handlers inline), `migrations/` numeradas, LGPD (se abrir área pública). Detalhe no relatório.

## 🧾 17. Auditoria de ações (audit_logs + login_logs) (2026-06-22)
- **Objetivo:** governança — saber **quem** mexeu em **quê** e **quando**. Escolha: só as tabelas no Supabase (sem tela no app; consulta via SQL Editor).
- **`audit_logs` por TRIGGERS no banco** (`supabase_audit_setup.sql`): a função `fn_audit()` (SECURITY DEFINER, `search_path` travado) registra **INSERT/UPDATE/DELETE** de `events`, `clients`, `logistics`, `event_cards`, `profiles`. Como roda no **servidor**, o cliente não burla nem falsifica. Guarda `actor_email`, `changed_at`, `operation`, `row_id`, `old_data`/`new_data` (jsonb). Ignora ruído de `profiles` quando só o `session_token` muda (login/refresh).
- **`login_logs`:** gravado pelo app no login bem-sucedido — helper `logLogin(user)` (best-effort, falha silenciosa) chamado após `startSessionTokenCheck`. Guarda `email`, `logged_at`, `user_agent`.
- **RLS:** só **Admin lê** ambas; **sem** policy de UPDATE/DELETE → **logs imutáveis** pela API. Índices por data/tabela/ator. Consultas de exemplo no fim do `.sql`.
- Versão: app-v2.js?v=38. 17/17 testes. **Pendente: rodar `supabase_audit_setup.sql` no Supabase + deploy.**

## 📈 18. Escalabilidade — paginação das cargas (2026-06-22)
- **Problema:** o Supabase tem teto padrão de **1000 linhas/requisição**. Os `.select('*')` de `events`, `clients`, `logistics`, `event_cards`, `artist_emails` baixavam tudo de uma vez — acima de 1000 registros **truncaria silenciosamente** e os totais (dashboard/financeiro/kanban) ficariam errados sem aviso.
- **Correção (v=39):** helper `fetchAllRows(table, orderColumn)` que **pagina em blocos de 1000** com `.range()`, ordenando por coluna estável (`id`/`email`/`group_id`) para não duplicar/perder linha entre páginas, e devolve o mesmo formato `{ data, error }`. As 5 funções de carga passaram a usá-lo. **Sem mudança visual** — só corrige o comportamento ao crescer. (Não paginei o app em "páginas de 50" de propósito: o app precisa do conjunto completo para somar totais.)
- Verificado: 17/17 testes. Versão app-v2.js?v=39. **Pendente: deploy.**

## 🛡️ 19. Endurecimento XSS + CSP sem unsafe-inline no script (2026-06-22)
- **Varredura XSS (resultado: LIMPO):** revisados todos os ~60 `innerHTML`. Todo campo livre (nomes de cliente/artista/vendedor, contato, notas, evento, e os campos de logística como motorista/placa/hotel/endereço via `fieldsTableHTML`) passa por `escapeHtml` antes de entrar no HTML. Os demais são texto estático, números (`formatCurrency`), enums de status ou cores geradas pelo sistema. `showWarningToast` usa `textContent`. Nenhum buraco encontrado.
- **Removido `'unsafe-inline'` do `script-src`** (vercel.json) — fecha a porta de XSS por script injetado. Para isso, toda lógica inline saiu do HTML:
  - Novo **`boot.js`** (carregado no `<head>`): anti-flicker do login + troca de painéis (Login/Cadastro/Recuperar via `data-switch-panel`) + submit do cadastro + 2 delegações que eram handlers inline no JS (remover artista; checkbox "pernoite").
  - `index.html`: bloco `<script>` inline → `boot.js`; 4 `onclick`/1 `onsubmit` → `addEventListener`.
  - `app-v2.js`: removidos os 2 handlers inline (`onclick` remover-artista, `onchange` pernoite) — agora por delegação no `boot.js`.
- **`style-src 'unsafe-inline'` mantido de propósito:** há 90+ `style=` inline no HTML e centenas gerados pelo JS; hash/nonce do CSP não cobre atributo `style`. Remover exigiria refatoração enorme sem ganho proporcional.
- Verificado: 17/17 testes + teste funcional temporário em jsdom (troca de painéis e submit do cadastro pelo `boot.js`) ✅. Versões: app-v2.js?v=40, boot.js?v=1.
- **⚠️ Verificação pós-deploy (importante):** como o CSP vem do header do Vercel (não dá pra testar 100% local), após o deploy confira: (1) trocar entre Login/Criar Conta/Esqueci a senha; (2) botão de remover artista no modal de evento; (3) checkbox "Pernoite na conexão" na logística; (4) Console do DevTools sem erros de CSP. **Pendente: deploy.**

## 🗂️ 20. Organização das migrations (2026-06-22)
- Os **11 scripts `.sql`** que estavam soltos na raiz foram movidos para a pasta **`migrations/`**, numerados na **ordem correta de aplicação** (001→007 + utilitário 090) e com **`migrations/README.md`** explicando ordem, dependências e idempotência.
- Ordem: `001_profiles_and_rls` → `002_add_session_token` → `003_clients` → `004_logistica` → `005_booker` → `006_kanban` → `007_audit`. Utilitário: `090_util_limpar_mocks` (rodar só se precisar limpar mocks).
- **Por que importa:** o trigger `handle_new_user` e o `CHECK` de `role` evoluem em etapas (Admin/Artista → +Logística → +Booker); fora de ordem, quebraria. O README documenta isso.
- As 3 versões antigas de RLS (`supabase_rls.sql`, `_fix`, `_hardening`) foram para **`migrations/_obsoletos/`** — substituídas pelo `001` (não rodar). Conteúdo de todos os scripts **inalterado** (cópia byte a byte verificada). **Nada precisa ser re-rodado no banco atual** — é organização/reprodutibilidade.

## 🔏 21. LGPD — mapeamento de dados + PII fora do navegador (2026-06-22)
- **Correção de privacidade (v=41):** o `handleLogout` chamava `saveState()`, que **regravava todo o PII no localStorage** — então clientes/contatos/logística/e-mails ficavam legíveis no DevTools depois do logout (risco em máquina compartilhada). Agora o logout chama **`clearLocalPII()`**, que apaga as chaves `sb_*` de dados pessoais/operacionais. Os dados seguem seguros no Supabase. Teste novo (18/18) confirma a limpeza (e que chave não-sensível como `sb_data_version` permanece).
- **Mapeamento de tratamento de dados** (`docs/lgpd-tratamento-de-dados.md`): inventário que a LGPD espera — quais dados pessoais são tratados (nomes, e-mails, contato de cliente, valores, dados de viagem), onde ficam (Supabase + cache), quem acessa (RLS por papel), medidas de segurança, direitos do titular (export/exclusão hoje via SQL do admin) e pendências.
- **Escopo:** sendo sistema **interno**, política pública/consentimento/termos **não** são bloqueantes — ficam na lista de pendências para **quando/se** abrir área pública. Hoje o obrigatório é o inventário (feito) e reduzir exposição de PII (feito).
- Versão app-v2.js?v=41. **Pendente: deploy.**

## 🧩 22. Modularização do backend (app-v2.js → js/) (2026-06-22)
- **O quê:** o monólito `app-v2.js` (~4.760 linhas) foi quebrado numa pasta **`js/` de módulos ES nativos** (`type="module"`, sem bundler), organizada **em camadas**: `core/` (supabase, state, config), `utils/` (format, dom, auth-errors, domain — funções puras), `data/` (repositórios: única camada que fala com o Supabase), `ui/` (toast, modal, dropdown, nav), `features/` (1 pasta por tela: dashboard, timeline, events, clients, settings, kanban, finance, logistics), `auth/auth.js` e `main.js` (orquestração no `DOMContentLoaded`).
- **Regra de ouro:** features nunca chamam `sbClient` direto — sempre via `data/`. Direção das dependências `features → data → core`; `utils`/`ui`/`config` são folhas. Sem ciclos proibidos (data/core/utils não importam de features).
- **Sem mudança de comportamento:** funções movidas verbatim, com `export`/`import`. Ajustes pontuais: `checkArtistDateConflict(events, …)` recebe os eventos por parâmetro (era global); gráficos do dashboard via setters de `state.js` (bindings de import são read-only); `STATUS_LABELS` centralizado em `config.js`.
- **Cutover (reversível):** `index.html` passou de `<script src="app-v2.js?v=41">` para `<script type="module" src="js/main.js?v=1">`. Rollback = reverter essa 1 linha.
- **boot.js** encolheu para só o anti-flicker do login; a "cola" (troca de painéis, submit do cadastro, delegações de remover-artista e pernoite) migrou para os módulos.
- **Testes:** `__tests__/app.test.js` e os `utils-*.test.js` passaram a importar de `js/` (Jest + babel-jest, ESM). Suíte: 34 verdes.
- Feito na branch `refactor/modularizacao`. **Pendente: validar no navegador (deploy/preview) e merge.**

## 📂 Onde está cada coisa
| Arquivo | O quê |
|---|---|
| `index.html`, `js/` (ES modules em camadas), `style.css` | App (SPA vanilla JS) — `js/main.js` é o ponto de entrada |
| `boot.js` | Anti-flicker do login (script clássico no `<head>`, antes da pintura) |
| `vercel.json` | Cabeçalhos de segurança (CSP, HSTS etc.) no deploy do Vercel |
| `migrations/00x_*.sql` | Scripts de banco **numerados e ordenados** (rodar no SQL Editor). Ver `migrations/README.md`. Versões antigas de RLS em `migrations/_obsoletos/` (não rodar). |
| `docs/superpowers/specs/` e `plans/` | Desenhos e planos detalhados |
| `__tests__/app.test.js` | Testes (Jest) das funções puras |

## ⚠️ Notas
- O projeto **não usa git** ainda (posso fazer `git init` se você quiser versionar de verdade).
- Evitar editar o projeto por **várias abas do Claude ao mesmo tempo** — causa conflito.
