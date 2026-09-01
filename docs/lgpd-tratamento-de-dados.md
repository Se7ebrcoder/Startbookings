# StartBookings — Mapeamento de Tratamento de Dados (LGPD)

> Registro interno de quais dados pessoais o sistema trata, para quê, onde ficam
> e quem acessa. É o **inventário de dados** que a LGPD espera de quem trata
> dados pessoais — vale mesmo sendo uma ferramenta interna.
>
> **Atualizado em:** 2026-06-22 · **Responsável:** administrador do StartBookings.
> ⚖️ Os trechos com implicação jurídica (bases legais, retenção, contratos com
> terceiros) devem ser revisados por um advogado antes de qualquer uso público.

## 1. Natureza do sistema

Ferramenta **interna** de gestão de uma agência de bookings. **Não há área
pública nem formulários abertos** hoje. Os usuários são a equipe (Admin,
Booker, Logística) e os artistas. Os **titulares** cujos dados são tratados são
principalmente **artistas** e **contratantes/clientes**.

## 2. Dados pessoais tratados

| Dado | De quem | Onde (tabela) | Finalidade |
|---|---|---|---|
| Nome / nome artístico | Artistas, equipe | `profiles`, `artist_emails`, `events.artist`, `events.vendedor` | Identificar artista/vendedor nos shows |
| E-mail | Usuários (login), artistas, bookers, logística | `auth.users`, `profiles`, `artist_emails`, `booker_emails`, `logistics_emails` | Autenticação e mapeamento de papel |
| Nome e **contato** do cliente | Contratantes | `clients.name`, `clients.contact` | Contato comercial do evento |
| Valores financeiros | Eventos | `events.amount`, `finance_notes`, `logistics` | Controle financeiro/cachê |
| Dados de viagem | Artistas | `logistics.data` (hotel, endereço, motorista, placa, horários) | Organização logística do show |
| Registros de acesso/ação | Usuários | `login_logs`, `audit_logs` | Segurança e auditoria |

> ⚠️ **Não** são tratados hoje: CPF/CNPJ, RG, endereço residencial, dados
> bancários. **Se** forem adicionados no futuro, são dados sensíveis/críticos e
> exigem cuidado redobrado (criptografia, acesso restrito, contrato).

## 3. Onde os dados ficam armazenados

- **Supabase (PostgreSQL na nuvem):** fonte de verdade. Protegido por **RLS**
  (cada papel só vê o que pode), HTTPS obrigatório, e chaves secretas fora do
  cliente.
- **Navegador (localStorage):** cópia em cache para o app funcionar rápido.
  ✅ **Desde 2026-06-22, esse cache é apagado no logout** (`clearLocalPII`), para
  não deixar PII legível numa máquina compartilhada.

## 4. Quem acessa (controle de acesso)

| Papel | Acesso |
|---|---|
| **Admin** | Tudo (eventos, clientes, financeiro, logística, auditoria) |
| **Booker** | Só os eventos que ele vendeu (`vendedor`) |
| **Artista** | Só os próprios shows |
| **Logística** | Dados de logística dos shows |

Controle imposto pela **RLS no banco** (não só na interface) — ver
`migrations/001_profiles_and_rls.sql` e `005_booker.sql`.

## 5. Medidas de segurança aplicadas

- RLS por papel; autorização nunca vem de `user_metadata` (não falsificável).
- HTTPS + headers de segurança + **CSP sem `unsafe-inline` no script** (anti-XSS).
- **hCaptcha** no login/cadastro (anti-bot/brute force).
- **Auditoria**: `audit_logs` (toda criação/edição/exclusão) + `login_logs`.
- **Sessão única** por usuário; **logout limpa o PII** do navegador.
- Segredos (`service_role`, secret do hCaptcha) só no Supabase.

## 6. Direitos do titular (acesso, correção, exclusão)

Hoje atendidos **manualmente pelo admin** via Supabase (SQL Editor):

- **Exportar** os dados de um titular (ex.: um artista):
  ```sql
  select * from events    where artist = 'NOME DO ARTISTA';
  select * from logistics where artist = 'NOME DO ARTISTA';
  ```
- **Excluir/anonimizar** um cliente: remover de `clients` (e decidir o que
  fazer com os eventos vinculados) — registrado automaticamente em `audit_logs`.

> 💡 Melhoria futura (quando fizer sentido): um botão "Exportar dados do
> titular" e "Excluir titular" na interface do admin.

## 7. Retenção

⚠️ **Hoje: tempo indeterminado — NÃO CONFORME** (Art. 15/16 da LGPD).

**Tabela de temporalidade definida no parecer de 30/08/2026 (a implementar):**

| Categoria | Prazo | Fundamento |
|---|---|---|
| Logística de viagem (hotel, voo, motorista, localizador) | **90 dias** após o show | Finalidade exaurida; risco alto ao titular |
| Shows e financeiro | **5 anos** após fim do contrato | Prescrição civil (CC 206 §5º I) + fiscal |
| `login_logs` | **6 meses** | Marco Civil da Internet, Art. 15 |
| `audit_logs` | **24 meses** | Legítimo interesse / prevenção a fraude |
| Contas inativas | Revisão anual | Necessidade |

➡️ Implementar via `pg_cron`. **Não existe nenhuma rotina de expurgo hoje** (verificado
nas 14 migrações).

## 7b. Achados do parecer LGPD de 30/08/2026

Parecer completo: artifact publicado em 30/08/2026 (ver histórico do projeto).

**🔴 Bloqueantes**
- **P-01 — `audit_logs` duplica todo dado pessoal para sempre.** Guarda `old_data`/`new_data`
  como `to_jsonb(OLD/NEW)` — a linha inteira. Cachê, endereço de hotel, motorista e
  localizador ficam em cópia permanente, o que **torna o direito de eliminação inexequível**
  (Art. 18, VI). Corrigir: gravar só campos alterados + redigir campos de risco + expurgo.
- **P-02 — Retenção indeterminada** (ver tabela acima).
- **P-06 — Transferência internacional sem instrumento.** Verificar região do Supabase
  (se `sa-east-1`, o dado fica no Brasil) e aceitar/solicitar os DPAs de Supabase e Vercel.
  Cláusulas-padrão: Resolução CD/ANPD nº 19/2024.

**🟠 Relevantes**
- **P-03 — Localizador (PNR) é credencial, não dado descritivo.** Permite alterar/cancelar a
  reserva no site da cia aérea. Mascarar ou eliminar após o embarque.
- **P-04 — Roteiro = localização de pessoa pública.** Risco físico (perseguição/furto) num
  vazamento. Justifica RIPD (Art. 38).
- **P-07 — Falta arcabouço documental:** registro de operações (Art. 37), plano de
  incidentes (Art. 48, prazo de **3 dias úteis** à ANPD — Res. CD/ANPD nº 15/2024), LIA e RIPD.
- **P-08 — Autocadastro aberto** contradiz a natureza interna declarada.

**🟡 Recomendações**
- **P-05 — Dados de terceiros** (motorista, recepção) que nunca usam o sistema: base é
  legítimo interesse, exige LIA e aviso via locadora/transfer.
- **P-09 — Reforços:** MFA no Admin, criptografia em coluna do localizador, teste de
  restauração de backup, revisão trimestral de acessos, e gravar `login_logs` por trigger
  (hoje o próprio usuário consegue inserir a própria linha).

**✅ Correções de inventário (o texto anterior estava impreciso)**
- `login_logs` **NÃO armazena IP** — só `email`, `logged_at` e `user_agent`. O IP existe
  apenas nos logs de infraestrutura de Supabase/Vercel/hCaptcha.
- hCaptcha **não coleta dado biométrico**. Movimento de mouse é dado pessoal comum, não
  biometria (Art. 5º, II) — se fosse, seria dado sensível e mudaria todo o regime.
- **Banner de cookies não é necessário:** só há `localStorage`/token estritamente
  necessários e nenhum rastreador de terceiros. Basta informar na Política.

**Bases legais (resumo):** equipe/artistas/clientes/logística = **execução de contrato**
(Art. 7º, V); financeiro = contrato + **obrigação legal** (Art. 7º, II); logs, sessão e
hCaptcha = **legítimo interesse** (Art. 7º, IX); artistas menores = **Art. 14** +
representação legal. **Consentimento quase nunca é a base correta aqui** — seria revogável
e travaria a operação.

## 8. Pendências de conformidade (priorizar SE abrir área pública)

- [ ] **Política de Privacidade** e **Termos de Uso** públicos.
- [ ] **Consentimento** explícito nos formulários públicos (contratante/artista).
- [ ] Aviso de cookies, se aplicável.
- [ ] Base legal documentada para cada finalidade.
- [ ] Definir política de **retenção** (item 7).
- [ ] Revisão jurídica deste documento.

> ⚠️ **REVISADO EM 30/08/2026:** a premissa de que "enquanto interno, não é bloqueante"
> está **incorreta**. A transparência (Art. 6º VI e Art. 9º) e a retenção (Art. 15/16)
> valem mesmo em sistema interno — artistas, equipe e clientes são titulares e têm
> direito de saber o que é tratado. Ver seção 7b para o plano priorizado.
