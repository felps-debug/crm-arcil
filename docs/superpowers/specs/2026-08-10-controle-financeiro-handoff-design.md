# Controle financeiro de handoff por boleto

## Objetivo

Evitar que a IA de cobrança retome uma conversa e cobre um boleto que o financeiro
acabou de receber ou renegociar. O financeiro decide o destino do atendimento no
CRM, por meio de uma interface curta; ele não precisa manipular etiquetas do
Chatwoot, Redis ou n8n.

## Problema atual

O workflow `CHATWOOT — CONTROLE DE HANDOFF` bloqueia a IA quando alguém do
financeiro assume a conversa. Hoje, ao marcar a conversa como resolvida no
Chatwoot, ele apaga automaticamente a trava Redis. "Resolvida" não informa se o
cliente pagou, renegociou, ficou sem responder ou apenas precisa voltar ao bot.
Com mais de um boleto, tratar o lead inteiro como "pago" perde a informação de
quais títulos permanecem em aberto.

## Decisões aprovadas

- A operação do financeiro acontece no CRM; o n8n opera em segundo plano.
- Cada boleto do lead recebe uma decisão individual: `em_aberto`, `pago` ou
  `renegociado`.
- O atendimento recebe um destino explícito: `devolver_ao_bot` ou `sem_retorno`.
- `pago` e `renegociado` não liberam a IA automaticamente.
- `sem_retorno` devolve a conversa à IA e reativa os follow-ups de cobrança.
- A conversa nunca é devolvida à IA somente por ter sido marcada como resolvida no
  Chatwoot.

## Experiência no CRM

No detalhe de um lead de cobrança que esteja em handoff humano, haverá um cartão
"Finalizar atendimento financeiro".

1. O cartão mostra apenas os boletos ainda relevantes para cobrança, com documento,
   vencimento e valor atual.
2. Ao lado de cada boleto, o financeiro escolhe `Manter em aberto`, `Pago` ou
   `Renegociado`.
3. Em `Renegociado`, o formulário solicita uma observação curta. A alteração do
   valor/vencimento oficial continua sendo responsabilidade da sincronização do ERP.
4. A pessoa escolhe o destino: `Devolver ao bot` ou `Sem retorno`.
5. Ao confirmar, o CRM registra uma trilha de auditoria, protege imediatamente os
   boletos marcados como pagos/renegociados contra nova cobrança da IA e chama o
   workflow de controle no n8n.

O botão fica indisponível enquanto a gravação estiver em curso, apresenta uma
mensagem de erro recuperável e mantém as escolhas do formulário caso a chamada
falhe.

## Modelo de dados

Criar uma tabela de decisões manuais por boleto, em vez de sobrescrever a carga do
ERP:

`cobranca_handoff_boletos`

| Campo | Finalidade |
| --- | --- |
| `id` | Identificador da decisão |
| `lead_id` | Lead atendido |
| `boleto_id` | Boleto/posição que recebeu a decisão |
| `status` | `pago` ou `renegociado` |
| `note` | Obrigatória em renegociação; opcional em pagamento |
| `recorded_by` | Usuário do CRM que confirmou |
| `recorded_at` | Momento da confirmação |
| `superseded_at` | Encerramento da proteção após a sincronização do ERP |

Uma decisão ativa nessa tabela funciona como uma **supressão de cobrança**: até o
ERP refletir a alteração, a IA não menciona aquele boleto. A fonte financeira
oficial continua sendo a tabela/posição sincronizada do ERP; a decisão do CRM não
altera valor, vencimento ou baixa financeira oficial.

Também criar um registro de encerramento de handoff por lead, com destino,
usuário, horário e observação. Ele será gravado em `activity_log` e, se necessário
para a interface, em uma tabela pequena de estado de handoff.

## Fluxo técnico

```text
Chatwoot: humano assume
  -> n8n grava handoff_accepted_at e cria Redis <bot>_<telefone>_block

CRM: financeiro confirma boletos + destino
  -> API autenticada grava decisões e activity_log em transação
  -> API chama webhook interno do n8n com lead, telefone, bot e destino
  -> n8n:
       devolver_ao_bot / sem_retorno: DELETE na chave Redis
       pago / renegociado sem destino de retorno: mantém a chave Redis
  -> se sem_retorno: reativa/cria o follow-up de cobrança conforme a regra atual

IA de cobrança
  -> lê posição do ERP
  -> exclui boletos com decisão manual ativa
  -> cobra somente o saldo ainda elegível
```

## Alterações no n8n

1. Alterar `CHATWOOT — CONTROLE DE HANDOFF` para registrar o aceite humano, mas
   **não** apagar a trava Redis em `conversation_status_changed/resolved`.
2. Criar um workflow interno, autenticado, `CRM — FINALIZA HANDOFF FINANCEIRO`.
   Ele recebe o destino já validado pelo CRM e somente ele pode apagar a chave
   Redis. O webhook não será público sem segredo.
3. Ajustar o workflow/agente de cobrança para ignorar títulos com uma decisão
   manual ativa. Isso cobre pagamentos parciais: se um de dois boletos foi pago,
   somente o outro continua elegível.
4. Definir a reativação de follow-up para o destino `sem_retorno`, sem criar
   duplicatas.

## Segurança e auditoria

- Somente os papéis autorizados para cobrança podem confirmar o encerramento.
- A API usa o usuário autenticado; nunca recebe `recorded_by` do navegador como
  fonte confiável.
- O webhook CRM -> n8n usa segredo próprio e valida corpo/destino antes de tocar
  no Redis.
- Cada confirmação cria um `activity_log` com boletos afetados, destino e usuário.
- O UI mostra um aviso quando o ERP ainda não refletiu um título marcado como pago
  ou renegociado.

## Casos de erro

- Sem boletos selecionados como pagos/renegociados: a decisão de destino ainda pode
  ser confirmada.
- Pagamento parcial: somente os boletos selecionados ficam suprimidos; os demais
  podem voltar à IA.
- Falha antes da chamada n8n: nada é liberado; o CRM informa erro e permite tentar
  novamente.
- Falha no n8n após a gravação: a API mantém o registro pendente e permite
  reprocessamento idempotente. A chave Redis não é apagada até a confirmação do
  workflow.
- ERP ainda não sincronizado: a supressão manual impede a cobrança indevida; um
  alerta indica que a confirmação financeira ainda está pendente.

## Verificação

1. Handoff de lead com dois boletos cria trava Redis.
2. Financeiro marca apenas um como pago e devolve ao bot.
3. A chave Redis é apagada e a IA lista somente o boleto restante.
4. Financeiro marca um como renegociado; a IA não menciona esse título enquanto a
   posição do ERP não for atualizada.
5. `Sem retorno` libera a IA e reativa um único follow-up elegível.
6. Marcar a conversa como resolvida no Chatwoot, sem ação no CRM, não apaga a
   trava Redis.
7. Falha simulada no webhook não libera o bot e deixa uma ação reprocessável.

## Fora de escopo

- Baixar pagamentos ou criar renegociações no ERP diretamente pelo CRM.
- Deixar uma IA decidir se uma promessa de pagamento ou um comprovante equivale a
  pagamento confirmado.
- Alterar preços, juros ou vencimentos manualmente fora da fonte financeira
  sincronizada.
