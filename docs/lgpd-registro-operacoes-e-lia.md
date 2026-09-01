# Registro de Operações de Tratamento (ROPA) + Teste de Legítimo Interesse (LIA)

**StartBookings · Versão 1.0 · 30/08/2026**
Base: LGPD Art. 37 (registro) e Art. 10 (legítimo interesse).
Formato simplificado admitido para agente de pequeno porte — Resolução CD/ANPD nº 2/2022.

- **Controlador:** [PREENCHER: razão social / CNPJ]
- **Canal do titular:** [PREENCHER: e-mail]
- **Encarregado:** dispensada a indicação formal para agente de pequeno porte, desde que
  mantido o canal acima (Res. CD/ANPD nº 2/2022, Art. 11).

---

## Parte I — Registro das operações (Art. 37)

### OP-01 · Gestão de acesso da equipe interna
| | |
|---|---|
| **Titulares** | Sócios, bookers, equipe de logística |
| **Dados** | Nome, e-mail, hash de senha, papel de acesso |
| **Finalidade** | Autenticar e aplicar o menor privilégio |
| **Base legal** | Execução de contrato — Art. 7º, V |
| **Retenção** | Enquanto durar o vínculo + 5 anos |
| **Compartilhamento** | Supabase (operador) |
| **Segurança** | Hash de senha, RLS por papel, sessão única, captcha, MFA (a implantar) |

### OP-02 · Agenciamento de artistas
| | |
|---|---|
| **Titulares** | Artistas representados |
| **Dados** | Nome artístico, e-mail, agenda de shows, cachê |
| **Finalidade** | Executar o contrato de agenciamento |
| **Base legal** | Execução de contrato — Art. 7º, V. Menores: Art. 14 + representação legal |
| **Retenção** | 5 anos após o fim do contrato |
| **Compartilhamento** | Supabase (operador) |
| **Segurança** | RLS: artista alcança apenas os próprios shows |

### OP-03 · Relacionamento com contratantes
| | |
|---|---|
| **Titulares** | Produtores e representantes de casas de show |
| **Dados** | Nome e contato comercial |
| **Finalidade** | Formalizar contrato, cobrar e alinhar o evento |
| **Base legal** | Execução de contrato — Art. 7º, V (prospecção ativa: Art. 7º, IX) |
| **Retenção** | 5 anos após o último evento |
| **Segurança** | Leitura restrita a Admin |

### OP-04 · Logística de viagens
| | |
|---|---|
| **Titulares** | Artistas, equipe e **terceiros** (motorista, recepção) |
| **Dados** | Hotel e endereço, check-in/out, voo, localizador, horários, motorista, placa |
| **Finalidade** | Garantir deslocamento, hospedagem e recepção seguros |
| **Base legal** | Art. 7º, V (artista/equipe); Art. 7º, IX (terceiros — ver LIA-01) |
| **Retenção** | Localizador mascarado em D+2; roteiro anonimizado em D+90 (migração 016) |
| **Risco** | **Alto** — revela localização de pessoa pública. Ver RIPD |
| **Segurança** | Acesso restrito a Admin e Logística; anonimização automática |

### OP-05 · Controle financeiro
| | |
|---|---|
| **Titulares** | Artistas e bookers |
| **Dados** | Cachê, status de pagamento, reembolsos, metas |
| **Finalidade** | Faturamento, repasse e obrigações fiscais |
| **Base legal** | Art. 7º, V e II (obrigação legal) |
| **Retenção** | 5 anos (prescrição civil e prazos fiscais) |
| **Observação** | Nenhuma transação bancária trafega no sistema |

### OP-06 · Segurança e auditoria
| | |
|---|---|
| **Titulares** | Todos os usuários |
| **Dados** | Data/hora de login, user-agent, delta de alterações, token de sessão |
| **Finalidade** | Detectar acesso indevido, prevenir fraude, rastrear alterações |
| **Base legal** | Legítimo interesse — Art. 7º, IX (ver LIA-02) |
| **Retenção** | Login 6 meses; auditoria 24 meses (migração 015) |
| **Segurança** | Leitura só por Admin; gravação por função SECURITY DEFINER; log imutável |

### OP-07 · Proteção antirrobô
| | |
|---|---|
| **Titulares** | Quem acessa a tela de login |
| **Dados** | IP e sinais de interação (coletados pelo hCaptcha) |
| **Finalidade** | Bloquear força bruta e automação maliciosa |
| **Base legal** | Legítimo interesse — Art. 7º, IX (ver LIA-03) |
| **Retenção** | Definida pelo operador (hCaptcha) |
| **Transferência internacional** | Sim — operador nos EUA |

---

## Parte II — Teste de Legítimo Interesse (LIA)

Estrutura: finalidade legítima → necessidade → balanceamento → salvaguardas.

### LIA-01 · Dados de motorista e recepção
- **Finalidade legítima.** Segurança física do artista: saber quem o buscará, em qual
  veículo e com qual placa. Interesse concreto e atual, não hipotético.
- **Necessidade.** Não há meio menos invasivo: identificar o veículo sem nome e placa
  não cumpre a função. Coletamos o mínimo — nada além de nome, modelo e placa.
- **Balanceamento.** Expectativa do titular: motoristas de transfer contratados
  esperam que seus dados sejam repassados a quem vão transportar. Impacto baixo;
  não há decisão automatizada nem enriquecimento de perfil.
- **Salvaguardas.** Acesso restrito a Admin e Logística; anonimização automática em
  90 dias; aviso de privacidade repassado pela locadora/empresa de transfer;
  direito de oposição pelo canal do titular.
- **Conclusão:** legítimo interesse **aplicável**.

### LIA-02 · Logs de acesso e auditoria
- **Finalidade legítima.** Prevenir fraude e acesso indevido — hipótese expressamente
  reconhecida pela LGPD (Art. 11, §3º, por analogia, e Art. 16, II).
- **Necessidade.** Sem registro de quem alterou cachê ou cancelou show, não há como
  apurar fraude nem defender a agência em disputa.
- **Balanceamento.** Interesse do titular é **convergente**: o log também o protege.
  A minimização aplicada (só o delta, campos sensíveis redigidos) reduz o impacto ao
  mínimo compatível com a finalidade.
- **Salvaguardas.** Retenção limitada (6 e 24 meses); leitura só por Admin; log
  imutável pelo cliente; redação automática de campos sensíveis (migração 015).
- **Conclusão:** legítimo interesse **aplicável**.

### LIA-03 · hCaptcha
- **Finalidade legítima.** Impedir força bruta contra contas — proteção do próprio titular.
- **Necessidade.** Verificado na auditoria de segurança que o captcha é a barreira que
  efetivamente bloqueia automação no endpoint de autenticação.
- **Balanceamento.** Dado coletado é limitado e efêmero. **Não é dado biométrico**:
  sinais de interação não identificam unicamente a pessoa.
- **Salvaguardas.** Uso restrito às telas de autenticação; nenhum dado do captcha é
  armazenado pela agência; informado na Política de Privacidade.
- **Conclusão:** legítimo interesse **aplicável**.

---

## Revisão

Este registro deve ser revisto **anualmente** ou sempre que houver nova finalidade,
novo operador ou mudança de infraestrutura.

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 30/08/2026 | Elaboração inicial a partir do parecer de adequação |
