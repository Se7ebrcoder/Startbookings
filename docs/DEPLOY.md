# 🚀 Guia de Deploy — StartBookings (LEIA ANTES DE PUBLICAR)

> **Este arquivo é obrigatório.** Toda publicação de mudança — feita por você ou
> por uma IA/assistente — DEVE seguir este passo a passo. Ele existe porque o
> jeito errado de publicar já causou **perda de dados** (artistas/bookers sumindo)
> e **regressão de segurança** (código antigo voltando por cima do novo).

---

## ⛔ REGRA Nº 1 — NUNCA use "Add files via upload" no GitHub

O botão **"Add files via upload"** da interface web do GitHub **está PROIBIDO**
neste projeto. Foi ele que:

- subiu cópias **antigas e inseguras** por cima da versão correta (reintroduziu
  escalonamento de admin, PII no código, `Math.random` em IDs);
- **bifurcou o histórico** do Git (a `main` local e a do GitHub divergiram).

**A ÚNICA forma correta de publicar é por `git push`.** Sempre.

---

## 📍 Fatos da infraestrutura (para entender o porquê)

- O site é publicado pela **Vercel**, a partir da branch **`main`** do GitHub.
  Todo `git push` para a `main` dispara um **deploy automático**.
- Os **dados** (eventos, clientes, logística, elenco, equipe, cores, metas) moram
  **no Supabase (PostgreSQL)**, protegidos por RLS. O deploy do site **não** toca
  no banco. O `localStorage` do navegador é só **cache**.
- O schema do banco é versionado em **`migrations/`** (arquivos `.sql` numerados,
  idempotentes). Ver `migrations/README.md`.

---

## ✅ FLUXO PADRÃO — mudança só de código (sem banco)

1. **Faça as alterações** no código (aqui no projeto, não no GitHub web).
2. **Rode os testes** e só siga se estiverem verdes:
   ```bash
   npm test
   ```
3. **Confira o que mudou** (não deve haver nada inesperado, nem `nul`/`nul.txt`):
   ```bash
   git status
   git diff
   ```
4. **Commit** com mensagem clara do que mudou:
   ```bash
   git add <arquivos>
   git commit -m "tipo: descrição curta do que mudou"
   ```
5. **Sincronize antes de enviar** (evita divergência):
   ```bash
   git pull --rebase origin main
   ```
6. **Publique:**
   ```bash
   git push origin main
   ```
7. **Aguarde o deploy** da Vercel (~1 min) e faça **hard refresh** no navegador:
   **Ctrl + Shift + R** (os `.js` têm cache de 24h — sem isso o navegador pode
   continuar rodando a versão antiga).
8. **Verifique no ar** (ver checklist mais abaixo).

---

## 🗄️ FLUXO — mudança que envolve o BANCO (nova tabela, coluna, RLS, dados)

> ⚠️ **A ordem importa.** Rodar o SQL **ANTES** de publicar o frontend, senão o
> site novo tenta ler/gravar em algo que ainda não existe e falha (ou perde dados).

1. **Crie a migração** como novo arquivo numerado em `migrations/` (ex.:
   `013_minha_mudanca.sql`). Ela deve ser **idempotente**
   (`create ... if not exists`, `create or replace`, `on conflict do ...`,
   `drop policy if exists`). Registre a nova migração em `migrations/README.md`.
2. **Rode a migração no Supabase** → SQL Editor → New query → cole o `.sql` → Run.
   Confira o resultado das queries de conferência no fim do script.
3. **Só então** commit + `git push` do código que usa a mudança (fluxo padrão acima).
4. Hard refresh + verificação.

**Regra de ouro dos dados:** se algo precisa **sobreviver a logout, deploy ou
troca de navegador**, tem que estar **no Supabase** — nunca só no `localStorage`.

### ↔️ Exceção: quando a migração REMOVE algo que o código antigo usa

A ordem normal é *banco primeiro*. Mas se a migração **apaga** uma tabela, coluna
ou função que a versão publicada ainda chama, a ordem se **inverte**:

1. **Publique o frontend novo** (que não usa mais aquilo).
2. **Depois** rode a migração que remove.

Caso contrário o site que está no ar quebra na janela entre o SQL e o deploy.
Cada migração desse tipo traz o aviso no próprio cabeçalho do `.sql`.

---

## 🔐 Regras de segurança (não quebrar)

- **NUNCA** coloque no código do frontend: a `service_role` key, o *secret* do
  hCaptcha (`ES_…`), ou qualquer segredo. Eles ficam **só no painel do Supabase**.
- Chaves **públicas** (URL do Supabase, `sb_publishable_…`, sitekey do hCaptcha)
  ficam centralizadas em `js/core/env.js` — são públicas por design; quem protege
  os dados é o **RLS**.
- **Não** confie em `user_metadata` para papel/admin (o usuário edita). Papel vem
  de `profiles` / allowlist de e-mail no banco.
- IDs e sorteios usam `js/utils/id.js` (crypto), **não** `Math.random`.
- Ao mexer no CSP (`vercel.json`) ou trocar versão de CDN no `index.html`, mantenha
  o SRI e a URL exata em sincronia.

---

## 🔎 Checklist de verificação PÓS-DEPLOY

Depois do push + hard refresh:

- [ ] O site carrega e o **login funciona**.
- [ ] Console do navegador (F12) sem **erros de CSP** novos.
- [ ] A mudança que você fez aparece de fato (não é cache antigo).
- [ ] Se mexeu no elenco/equipe: os artistas/bookers continuam lá após **logout+login**.
- [ ] Se foi mudança de banco: as queries de conferência da migração rodaram OK.

Verificação rápida por terminal (opcional) — confirma que o arquivo novo está no ar:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://startbookings.vercel.app/js/main.js
```

---

## 🆘 Se a `main` local e a do GitHub divergirem (histórico bifurcado)

Sintoma: `git push` recusado por "non-fast-forward" / "diverged".

1. **NÃO** use `git push --force` às cegas (pode apagar trabalho).
2. Descubra o que cada lado tem:
   ```bash
   git fetch origin
   git log --oneline --graph main origin/main
   git diff -w --stat main origin/main
   ```
3. Se o **local** tem tudo o que importa e o remoto só tem lixo/versão antiga,
   reconcilie **sem destruir histórico**:
   ```bash
   git merge -s ours origin/main -m "merge: reconcilia origin mantendo a versão correta"
   git push origin main
   ```
4. Em dúvida, **pare e peça ajuda** antes de sobrescrever produção.

---

## 📌 Resumo em uma linha

**Editar → `npm test` → `git commit` → (rodar migração no Supabase, se houver) →
`git pull --rebase` → `git push origin main` → Ctrl+Shift+R → verificar.
NUNCA "Add files via upload".**
