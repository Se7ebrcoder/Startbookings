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

Atualmente os dados são mantidos **por tempo indeterminado**. 
➡️ **Pendência:** definir uma política de retenção (ex.: arquivar/anonimizar
eventos com mais de X anos) e documentar aqui.

## 8. Pendências de conformidade (priorizar SE abrir área pública)

- [ ] **Política de Privacidade** e **Termos de Uso** públicos.
- [ ] **Consentimento** explícito nos formulários públicos (contratante/artista).
- [ ] Aviso de cookies, se aplicável.
- [ ] Base legal documentada para cada finalidade.
- [ ] Definir política de **retenção** (item 7).
- [ ] Revisão jurídica deste documento.

> Enquanto o sistema for **100% interno**, os itens acima não são bloqueantes,
> mas este inventário (seções 1–7) já deve ser mantido atualizado.
