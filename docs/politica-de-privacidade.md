# Política de Privacidade — StartBookings

**Versão 1.0 · Vigente desde [PREENCHER: DD/MM/AAAA]**

> ⚠️ **ANTES DE PUBLICAR:** substitua todos os campos `[PREENCHER]` e submeta o
> documento à revisão de advogado. Os 12 tópicos exigidos pela LGPD já estão
> cobertos; falta apenas a informação societária e a validação jurídica.

---

## 1. Quem somos (Controlador)

- **Razão social:** [PREENCHER]
- **CNPJ:** [PREENCHER]
- **Endereço:** [PREENCHER]
- **Canal de privacidade:** [PREENCHER: ex. privacidade@suaagencia.com.br]

Somos o **controlador** dos dados pessoais tratados no StartBookings, nos termos
do Art. 5º, VI da Lei nº 13.709/2018 (LGPD) — ou seja, cabe a nós decidir o que é
tratado e para quê.

## 2. Como falar conosco sobre seus dados

Escreva para **[PREENCHER: e-mail]**. Respondemos:

- **Imediatamente**, em formato simplificado, pedidos de confirmação de que
  tratamos seus dados;
- **em até 15 dias**, pedidos que exijam declaração completa ou outra providência
  (Art. 19 da LGPD).

## 3. Quem são os titulares e quais dados tratamos

O StartBookings é um **sistema interno de gestão** de uma agência de booking
musical. Não é rede social nem serviço aberto ao público.

### 3.1 Equipe interna (Administradores, Bookers, Logística)
Nome, e-mail corporativo, senha (armazenada apenas como *hash*, nunca em texto) e
papel de acesso.

### 3.2 Artistas representados
Nome artístico, e-mail de acesso, agenda de shows, dados de viagem e valores de
cachê.

### 3.3 Clientes contratantes
Nome do contratante ou da produtora e contato comercial (telefone, WhatsApp,
e-mail). *Dados de pessoa jurídica não são dados pessoais; o nome e o contato da
pessoa que representa a empresa são.*

### 3.4 Terceiros envolvidos na viagem
Nome do motorista, modelo e placa do veículo, e nome de quem recepciona o artista
no destino — informações necessárias para que o artista saiba, com segurança,
quem irá recebê-lo.

### 3.5 Dados técnicos e de segurança
Data e hora dos acessos, identificação do navegador (*user-agent*), registros de
auditoria de alterações e token de sessão. Endereço IP é tratado apenas pelos
nossos prestadores de infraestrutura e pelo serviço antirrobô.

### 3.6 O que NÃO coletamos
Não coletamos CPF, CNPJ, RG, dados bancários, chave PIX, cartão de crédito,
endereço residencial, dados de saúde ou biometria. Nenhuma transação financeira
é processada pelo sistema — registramos apenas valores negociados e status de
pagamento.

## 4. Para que usamos cada dado, e com qual base legal

| Dado | Finalidade | Base legal (LGPD) |
|---|---|---|
| Equipe: nome, e-mail, senha, papel | Autenticar o acesso e limitar cada pessoa ao que ela precisa ver | Execução de contrato — Art. 7º, V |
| Artista: nome, e-mail, agenda, cachê | Executar o contrato de agenciamento: agendar shows, evitar conflito de datas e repassar o cachê | Execução de contrato — Art. 7º, V |
| Cliente: nome e contato | Formalizar o contrato do show, cobrar e alinhar horários | Execução de contrato — Art. 7º, V |
| Viagem: hotel, voo, transporte, motorista | Garantir deslocamento, hospedagem e recepção seguros do artista | Execução de contrato — Art. 7º, V; e legítimo interesse para dados de terceiros — Art. 7º, IX |
| Financeiro: cachê, status, reembolsos | Controlar o faturamento e cumprir obrigações fiscais e contábeis | Execução de contrato e obrigação legal — Art. 7º, V e II |
| Logs de acesso e auditoria; token de sessão | Detectar acesso indevido, prevenir fraude e rastrear alterações críticas | Legítimo interesse — Art. 7º, IX |
| hCaptcha: IP e sinais de interação | Bloquear robôs e ataques de força bruta na tela de login | Legítimo interesse — Art. 7º, IX |

**Não pedimos consentimento** para essas finalidades porque elas são
indispensáveis à execução do contrato ou à segurança do sistema. Onde a base é o
**legítimo interesse**, você pode se opor a qualquer momento pelo canal do item 2.

## 5. Com quem compartilhamos

Não vendemos, não alugamos e não compartilhamos dados com anunciantes. O sistema
**não utiliza** Google Analytics, Facebook Pixel, ferramentas de marketing ou
qualquer rastreador de terceiros.

Os únicos terceiros que tratam dados em nosso nome (**operadores**, Art. 39) são:

| Operador | Papel | Dados envolvidos |
|---|---|---|
| **Supabase** (sobre AWS) | Banco de dados e autenticação | Todos os dados do sistema |
| **Vercel** | Hospedagem da aplicação | Registros técnicos de requisição |
| **hCaptcha** | Proteção antirrobô no login | IP e sinais de interação |

## 6. Transferência internacional

Nossa infraestrutura pode processar dados **fora do Brasil**
(região: [PREENCHER: verificar no painel do Supabase; ex. `sa-east-1`/São Paulo
ou outra]). Quando há transferência internacional, ela se apoia nas **cláusulas
contratuais padrão** aprovadas pela ANPD na Resolução CD/ANPD nº 19/2024, nos
termos do Art. 33 da LGPD.

## 7. Por quanto tempo guardamos

| Categoria | Prazo | Motivo |
|---|---|---|
| Roteiros de viagem (hotel, voo, motorista) | **90 dias** após o show | Finalidade exaurida; reduz risco ao artista |
| Código localizador de passagem | **Mascarado 2 dias** após o show | Funciona como credencial da reserva |
| Shows e registros financeiros | **5 anos** após o fim do contrato | Prazo prescricional e obrigações fiscais |
| Registros de acesso (login) | **6 meses** | Art. 15 do Marco Civil da Internet |
| Registros de auditoria | **24 meses** | Prevenção a fraude e defesa em disputas |
| Cache no seu navegador | Até o **logout** | Apagado automaticamente ao sair |

Vencido o prazo, os dados são eliminados ou anonimizados automaticamente.

## 8. Seus direitos

Você pode, a qualquer momento (Art. 18 da LGPD):

1. Confirmar se tratamos seus dados;
2. Acessar os dados que temos sobre você;
3. Corrigir dados incompletos, inexatos ou desatualizados;
4. Pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;
5. Solicitar a portabilidade para outro fornecedor;
6. Ser informado com quem compartilhamos seus dados;
7. Opor-se a tratamento baseado em legítimo interesse;
8. Revogar consentimento, quando essa for a base utilizada.

**Sobre a exclusão — um esclarecimento honesto:** ao pedir eliminação, apagamos
seu nome, contatos, vínculos de acesso e roteiros de viagem. Os **registros
financeiros dos shows são mantidos de forma despersonalizada**, porque a lei nos
obriga a guardá-los para fins fiscais e contábeis (Art. 16, I). Nesses casos,
informamos exatamente o que ficou retido e por quê.

## 9. Como protegemos

Controle de acesso por papel aplicado no próprio banco de dados (cada pessoa só
alcança o que lhe cabe); criptografia em trânsito (HTTPS/TLS); senhas armazenadas
apenas como *hash*; verificação antirrobô obrigatória no login; sessão única por
conta; registro imutável de auditoria; e limpeza automática do cache do navegador
ao sair. Realizamos auditorias de segurança periódicas.

Nenhum sistema é infalível. Em caso de incidente com risco relevante,
comunicaremos você e a ANPD nos prazos da Resolução CD/ANPD nº 15/2024.

## 10. Cookies

Não utilizamos cookies de rastreamento, publicidade ou análise de audiência.
Usamos apenas armazenamento local **estritamente necessário** ao funcionamento —
o token que mantém você conectado e um cache temporário da interface, ambos
apagados no logout. Por serem indispensáveis, não exigem banner de consentimento.

## 11. Artistas menores de idade

Caso a agência represente artista menor de idade, o tratamento observa o **melhor
interesse do menor** (Art. 14 da LGPD) e depende de contrato firmado pelos pais ou
responsáveis legais. Tratamos apenas dados operacionais indispensáveis
(nome artístico, agenda, viagem e cachê) — nunca mais do que isso.

## 12. Alterações desta Política

Mudanças relevantes serão comunicadas por e-mail aos usuários do sistema com pelo
menos 15 dias de antecedência. O histórico de versões fica registrado abaixo.

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | [PREENCHER] | Publicação inicial |
