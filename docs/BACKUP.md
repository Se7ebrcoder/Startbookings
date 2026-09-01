# 💾 Backup e Restauração — StartBookings

> 🔴 **Situação hoje: o banco NÃO tem backup automático.**
> O projeto está no **plano Free** do Supabase, que **não faz backups**. A
> própria documentação deles orienta: *"free tier plan projects [should]
> regularly export their data using the Supabase CLI db dump command and
> maintain off-site backups"*.
>
> Traduzindo: se alguém apagar dados por engano, ou o projeto tiver uma falha,
> **agenda, financeiro, clientes e logística vão embora sem recuperação.**
> Este documento existe para resolver isso.

---

## O que precisa de backup (e o que já está protegido)

| Item | Onde vive | Situação |
|---|---|---|
| **Banco de dados** | Supabase (PostgreSQL) | 🔴 **Sem backup** — é o que este guia resolve |
| **Contas de login** | Supabase Auth (schema `auth`) | 🔴 Incluído no dump completo |
| **Código do sistema** | GitHub + este computador | ✅ Já versionado |
| **Migrações do banco** | `migrations/` no Git | ✅ Já versionado |

O código já tem duas cópias (GitHub e sua máquina). **O banco não tem
nenhuma.** É nele que está o valor real: anos de shows, valores e contratos.

---

## Escolha a estratégia

### Opção A — Plano Pro do Supabase (recomendado se houver orçamento)

**US$ 25/mês.** Passa a ter **backup automático diário com 7 dias de
retenção**, feito pelo próprio Supabase, sem você lembrar de nada.

Para um sistema que guarda faturamento e contratos de uma agência, é barato
perto do risco. Ative em: *Supabase → Settings → Billing → mudar plano*.

> Mesmo no Pro, **continue fazendo dumps periódicos** (Opção B). Backup do
> fornecedor protege contra falha do fornecedor; backup próprio protege
> contra *perder o acesso à conta do fornecedor*. São riscos diferentes.

### Opção B — Dump manual (obrigatória enquanto estiver no Free)

Um script já pronto exporta tudo para o seu computador.

---

## Como fazer o backup (Opção B)

### Configuração — uma única vez

1. **Pegue a string de conexão:**
   No painel do Supabase, clique no botão **"Connect"** no topo da página do
   projeto (ao lado do nome do projeto). Abre um painel com várias abas.

   Escolha **Session pooler** e copie a URI. Ela se parece com:
   ```
   postgresql://postgres.jijjacpgbnubamawbscw:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```

   > ⚠️ **Use o Session pooler, não a conexão direta.** Verificado neste
   > projeto: o host da conexão direta (`db.jijjacpgbnubamawbscw.supabase.co`)
   > resolve **somente em IPv6**, e IPv4 nela é um add-on pago — de uma rede
   > doméstica comum ela simplesmente não responde. O **Session pooler**
   > atende em IPv4 em todos os planos e, por operar em *modo sessão*
   > (porta **5432**), funciona com `pg_dump`.
   >
   > **Não use o Transaction pooler** (porta **6543**): ele não suporta
   > *prepared statements* e o dump falha.

   Repare que no pooler o usuário tem o formato `postgres.<ref-do-projeto>`,
   e não apenas `postgres`. Copie do painel em vez de montar à mão.

2. **Crie o arquivo `scripts\.backup-env.ps1`** com uma linha:
   ```powershell
   $env:SB_DB_URL = "postgresql://postgres.jijjacpgbnubamawbscw:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
   ```
   ⚠️ Esse arquivo contém a **senha do banco**. Ele já está no `.gitignore` e
   **nunca** deve ir para o GitHub.

### Rodar o backup

No terminal, dentro da pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```

Gera, em `C:\Users\<você>\StartBookings-Backups\<data_hora>\`:

| Arquivo | Conteúdo |
|---|---|
| `schema.sql` | Estrutura: tabelas, funções, **policies RLS**, triggers |
| `data.sql` | Os dados |
| `roles.sql` | Papéis do cluster |
| `RESUMO.txt` | Data, origem e aviso de LGPD |

O script mantém as **12 execuções mais recentes** e apaga as anteriores.

### Com que frequência

| Frequência | Para quem |
|---|---|
| **Semanal** | Mínimo aceitável no plano Free |
| **Antes de qualquer migração** | Sempre — é a rede de segurança se o SQL der errado |
| **Diária** | Se o volume de shows crescer |

💡 Para automatizar no Windows: **Agendador de Tarefas** → nova tarefa
semanal → ação: `powershell.exe`, argumentos:
`-ExecutionPolicy Bypass -File "C:\...\Projeto site StartBookings\scripts\backup.ps1"`

### ⚠️ Guarde fora do computador

Backup que mora só na máquina que pode pifar **não é backup**. Copie a pasta
para pelo menos um destino externo: HD externo, pen drive, ou uma nuvem.

Se usar nuvem, lembre que o backup **contém dados pessoais** — prefira uma
pasta com acesso restrito e, de preferência, criptografada.

---

## Como restaurar

> 🧪 **Teste isto pelo menos uma vez, num projeto novo e vazio.** Backup que
> nunca foi restaurado é só um arquivo — você só descobre que ele não presta
> no dia em que precisar dele.

### Cenário 1 — Alguém apagou alguns registros

Não restaure o banco inteiro. Abra o `data.sql`, localize as linhas da tabela
afetada e reinsira apenas elas pelo SQL Editor. O `audit_logs` ajuda a
descobrir o que foi apagado e quando:

```sql
select changed_at, actor_email, table_name, operation, row_id
  from public.audit_logs
 where operation = 'DELETE'
   and changed_at > now() - interval '7 days'
 order by changed_at desc;
```

### Cenário 2 — Perda total do projeto

1. Crie um projeto Supabase novo, **região `sa-east-1` (São Paulo)**.
2. No SQL Editor, rode na ordem: `roles.sql` → `schema.sql` → `data.sql`.
3. Atualize a URL e a chave publishable em [`js/core/env.js`](../js/core/env.js).
4. Confira o CSP no `vercel.json` (ele fixa domínios do Supabase).
5. Rode as verificações do [DEPLOY.md](DEPLOY.md).

> Alternativa: reconstruir o schema rodando as migrações `001` a `020` na
> ordem e depois só o `data.sql`. Mais previsível, porque as migrações são
> idempotentes e revisadas.

### Cenário 3 — Migração deu errado

É por isso que a regra é **fazer backup antes de rodar migração**. Com o dump
em mãos, restaure só a parte afetada.

---

## LGPD — o backup também é tratamento de dados

O backup contém dados pessoais: cachês, contatos de clientes e **roteiros de
viagem de artistas** (o dado de maior risco do sistema). Portanto:

- **Guarde em local controlado**, não em pasta compartilhada ou e-mail.
- **Aplique retenção**: o script já mantém só as 12 execuções mais recentes.
  Backup eterno contradiz a política de retenção do sistema (Art. 15/16).
- **Não é lugar para "guardar o que foi apagado"**: se um titular pediu
  exclusão, os backups antigos que ainda o contêm devem sair no ciclo normal
  de rotação — e isso deve ser informado ao titular.
- **Se subir para nuvem estrangeira**, isso é transferência internacional
  (Art. 33) — hoje o banco está no Brasil justamente para evitar isso.

---

## Checklist rápido

- [ ] Criar `scripts\.backup-env.ps1` com a string de conexão
- [ ] Rodar o primeiro backup e conferir os 3 arquivos
- [ ] Copiar a pasta para um destino externo
- [ ] Agendar a execução semanal
- [ ] **Testar uma restauração** num projeto novo
- [ ] Avaliar o plano Pro (backup automático diário)
