# Auditoria de Segurança — StartBookings
**Data:** 04/07/2026 · **Escopo:** frontend (HTML/JS), migrações SQL (Supabase/RLS), headers (vercel.json), configs.

> **Status final — re-auditoria de 04/07/2026:** TODOS os achados de código
> corrigidos e re-verificados (#1–#9). A re-varredura encontrou e removeu um
> último bloco de e-mails hardcoded que havia escapado (fallback no "Adicionar
> Artista" de `settings/view.js`) e endureceu o `.vercelignore` (`.superpowers`,
> `migrations/`, `package*.json` fora do deploy).
>
> **Pendências (fora do código):**
> 1. Rodar `migrations/009_resolve_login.sql` no Supabase antes do próximo deploy
>    (sem ela, login por NOME falha; por e-mail continua normal).
> 2. Checklist do painel Supabase (#10): redirect allowlist, hCaptcha server-side,
>    senha mínima 8, chaves legadas desativadas.

---

## Resumo executivo

O projeto está **acima da média** em segurança para um SPA + Supabase: RLS ativo em todas as tabelas, papéis derivados de fontes confiáveis (e-mail verificado / tabela `profiles`), chave *publishable* (não secreta) no cliente, CSP sem `unsafe-inline` para scripts, SRI nos CDNs, hCaptcha, HSTS, auditoria imutável via triggers `SECURITY DEFINER` com `search_path` travado, e uso disciplinado de `escapeHtml()` na renderização.

Nenhuma falha **crítica** foi encontrada. Foram identificados **2 achados médios**, **4 baixos** e **4 informativos**.

| # | Severidade | Achado |
|---|-----------|--------|
| 1 | 🟠 Média | Sessão única (`session_token`) não funciona para não-admins (RLS bloqueia o update silenciosamente) |
| 2 | 🟠 Média | E-mails pessoais (admins, bookers, artistas) hardcoded no código público do frontend |
| 3 | 🟡 Baixa | XSS residual em `settings/view.js` (interpolação sem escape de e-mail e cor) |
| 4 | 🟡 Baixa | `audit_logs` grava `session_token` dentro de `old_data`/`new_data` |
| 5 | 🟡 Baixa | `login_logs`: campo `email` é declarado pelo cliente (spoofável) |
| 6 | 🟡 Baixa | CSP permite `unpkg.com` e `cdnjs` inteiros em `script-src` |
| 7 | 🔵 Info | Senha mínima inconsistente (HTML `minlength=6` vs JS 8) |
| 8 | 🔵 Info | GRANTs mais amplos que o necessário em `profiles` |
| 9 | 🔵 Info | Cache de PII em `localStorage` persiste se o usuário nunca fizer logout |
| 10 | 🔵 Info | Confirmar configurações do painel Supabase (redirect allowlist, hCaptcha, senha mínima) |

---

## 1. 🟠 Sessão única quebrada para não-admins

**Onde:** `js/data/profiles.repo.js` (`startSessionTokenCheck`) + `migrations/001_profiles_and_rls.sql`.

**O problema:** a policy `profiles_update_admin` só permite UPDATE em `profiles` para admin. Quando um Artista/Booker/Logística loga, o `update({ session_token })` afeta **0 linhas** — o RLS filtra sem gerar erro, e o código não verifica o retorno. Resultado: `session_token` no banco fica sempre `null` para não-admins, e a checagem `pData.session_token !== myToken` nunca dispara. O controle de "desconectar sessão antiga" **só funciona para admins**.

**Risco:** um controle de segurança que você acredita estar ativo não está. Credenciais compartilhadas/vazadas de artista podem ser usadas em N dispositivos simultâneos sem detecção.

**Correção (recomendada):** mover o token para uma tabela própria, com RLS de "dono da linha":

```sql
-- migrations/008_user_sessions.sql
create table if not exists public.user_sessions (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  session_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.user_sessions enable row level security;
grant select, insert, update on public.user_sessions to authenticated;

create policy "sessions_own" on public.user_sessions
  for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- Remover a coluna antiga depois de migrar o front:
-- alter table public.profiles drop column if exists session_token;
```

No front (`profiles.repo.js`), trocar os acessos de `profiles.session_token` para `user_sessions` via `upsert`, e **verificar o erro**:

```js
const { error } = await sbClient.from("user_sessions")
  .upsert({ user_id: user.id, session_token: myToken, updated_at: new Date().toISOString() });
if (error) console.error("Falha ao registrar sessão única:", error);
```

Isso também elimina o achado #4 (token não passa mais pelo trigger de auditoria de `profiles`).

---

## 2. 🟠 E-mails pessoais expostos no bundle público

**Onde:** `js/auth/auth.js` (ADMIN_EMAILS, BOOKER_EMAILS), `js/core/state.js` (artistEmails, adminEmails, bookerEmails), `migrations/*.sql` (aceitável — não é público).

**O problema:** os e-mails pessoais de todos os admins, bookers e artistas estão hardcoded em JavaScript servido a qualquer visitante (mesmo sem login). O recurso "login por nome de artista" ainda permite mapear nome → e-mail no cliente.

**Risco:** não há escalação de privilégio (o RLS ignora esses valores — correto), mas é **exposição de dados pessoais (LGPD, art. 46)** e facilita phishing direcionado / credential stuffing contra contas específicas, inclusive as de admin.

**Correção:**
1. Remover todas as listas de e-mail do código do frontend. Elas já existem no banco (`profiles`, `artist_emails`, `booker_emails`) — fonte de verdade correta.
2. O papel/nome exibido após o login deve vir **somente** de `fetchProfileData()` (já implementado) — os fallbacks por e-mail hardcoded em `auth.js` podem ser apagados.
3. Para o "login por nome de artista", criar uma RPC que resolve nome → e-mail **no servidor**, sem expor o mapa:

```sql
create or replace function public.resolve_login(identifier text)
returns text language sql stable security definer set search_path = ''
as $$
  select ae.email from public.artist_emails ae
  where lower(ae.artist_name) = lower(identifier) limit 1
$$;
-- Atenção: esta RPC permite confirmar que um nome de artista existe.
-- Alternativa mais segura: exigir login apenas por e-mail.
```

A opção mais simples e mais segura: aceitar login **apenas por e-mail** e remover o mapeamento.

---

## 3. 🟡 XSS residual em `settings/view.js`

**Onde:** linhas ~147 e ~157 (e bloco equivalente dos vendedores, ~286–315).

```js
mappedEmail = ` <span ...>(${found})</span>`;        // 'found' sem escapeHtml
... data-name="${safeArtist}" value="${color}" ...    // 'color' sem validação
```

**O problema:** `found` (e-mail) e `color` são interpolados em `innerHTML` sem escape. Hoje esses valores vêm de `localStorage` (`sb_artistEmails`, `sb_tagColors`), que um atacante local — ou um XSS futuro em outro ponto — pode envenenar para obter **persistência** (o payload roda a cada render da tela de Configurações).

**Risco:** baixo isoladamente (exige acesso prévio ao navegador ou outra falha), mas quebra a disciplina de escape que o resto do código mantém.

**Correção:**

```js
mappedEmail = ` <span style="...">(${escapeHtml(found)})</span>`;

const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#ffcc00";
// usar safeColor no template
```

Recomendo varrer os 13 arquivos que usam `innerHTML` (61 ocorrências) com esta regra: **toda** interpolação `${...}` em template de HTML passa por `escapeHtml()` ou por validação estrita (cores, IDs numéricos).

---

## 4. 🟡 `audit_logs` vaza `session_token`

**Onde:** `migrations/007_audit.sql` (`fn_audit`).

**O problema:** o filtro só ignora updates que mexem *apenas* no `session_token`. Se um admin editar `role` de um perfil, o log grava a linha inteira — incluindo o token de sessão vigente — em `old_data`/`new_data`, legível por qualquer admin.

**Correção:** remover o campo antes de gravar:

```sql
if (TG_TABLE_NAME = 'profiles') then
  v_old := v_old - 'session_token';
  v_new := v_new - 'session_token';
end if;
```

(Se aplicar a correção #1, o token sai de `profiles` e isso se resolve por arquitetura.)

---

## 5. 🟡 `login_logs.email` spoofável

**Onde:** `007_audit.sql` + `profiles.repo.js` (`logLogin`).

**O problema:** a policy garante `user_id = auth.uid()`, mas `email` e `user_agent` são texto livre do cliente. Um usuário autenticado pode inserir logs com e-mail de outra pessoa, poluindo a trilha de auditoria.

**Correção:** preencher o e-mail no servidor:

```sql
create or replace function public.fn_login_log_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.email := lower(coalesce(auth.jwt() ->> 'email', ''));
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_login_log_email on public.login_logs;
create trigger trg_login_log_email
  before insert on public.login_logs
  for each row execute function public.fn_login_log_email();
```

---

## 6. 🟡 CSP: `script-src` amplo demais

**Onde:** `vercel.json`.

**O problema:** `script-src 'self' https://cdnjs.cloudflare.com https://unpkg.com ...` autoriza **qualquer** script desses CDNs, não só Chart.js e supabase-js. Se surgir uma injeção de tag `<script>` (hoje mitigada pelo escape), o atacante pode carregar qualquer pacote do unpkg.

**Correção (em ordem de preferência):**
1. Servir Chart.js e supabase-js localmente (`assets/vendor/`) e reduzir para `script-src 'self' https://js.hcaptcha.com https://*.hcaptcha.com` — como as versões já são travadas com SRI, baixá-las uma vez é equivalente e mais rápido (menos DNS/conexões).
2. Ou usar hashes no CSP: `script-src 'self' 'sha384-dug+Jxf...' 'sha384-EjUdIVm...' ...`.

Bônus: adicionar `require-trusted-types-for 'script'` quando migrar os `innerHTML` para Trusted Types (projeto futuro).

---

## 7–10. 🔵 Informativos

**7. Senha mínima inconsistente** — `index.html` usa `minlength="6"` nos campos, o JS exige 8. Alinhar para 8 no HTML e configurar o mínimo também no painel Supabase (Auth → Providers → Password), que é o único que vale de verdade.

**8. GRANTs amplos em `profiles`** — `grant insert, update, delete ... to authenticated` é mais largo que o uso real. As policies protegem, mas por defesa em profundidade: `revoke delete on public.profiles from authenticated;` (o app nunca deleta perfis pelo cliente).

**9. PII em `localStorage`** — `clearLocalPII()` roda só no logout. Em máquina compartilhada, quem nunca clica "Sair" deixa eventos/clientes legíveis no DevTools. Mitigações: usar `sessionStorage` para os caches de dados (como já faz com o token de auth) ou aceitar o risco documentado (já está no doc LGPD — ok como decisão consciente).

**10. Confirmar no painel Supabase** (não visível no código):
- **Auth → URL Configuration:** redirect allowlist contendo só o domínio de produção (o `resetPasswordForEmail` usa `redirectTo` dinâmico — sem allowlist restrita, seria open-redirect de link de recuperação).
- **Auth → Attack Protection:** hCaptcha habilitado no servidor (sem isso, o captcha do front é decorativo — os docs indicam que está ativo; vale conferir).
- **Confirm email** ligado; *rate limits* de auth nos padrões ou mais restritos.
- Chaves legadas (`anon` JWT / `service_role` antiga que vazou no histórico) **desativadas** — os docs dizem que sim; confirmar que não foram reativadas.

---

## O que está bem feito (manter)

RLS em todas as tabelas com papéis vindos de e-mail verificado/`profiles` (nunca `user_metadata`); funções SQL com `search_path` travado; auditoria imutável server-side; chave publishable no cliente com RLS como portão real; CSP sem `unsafe-inline` para scripts + SRI + versões travadas; HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy; hCaptcha nos 3 formulários; `escapeHtml` como padrão de renderização; token de auth em `sessionStorage` (não cookie → CSRF não se aplica); `noindex` no sistema interno; limpeza de PII no logout.

## Priorização sugerida

1. **Hoje:** #3 (escape em settings — 5 min) e #4 (uma linha de SQL).
2. **Esta semana:** #1 (tabela `user_sessions`) e #5 (trigger no login_logs).
3. **Próximo ciclo:** #2 (remover e-mails do bundle) e #6 (vendorizar CDNs).
4. **Checklist painel:** item #10.
