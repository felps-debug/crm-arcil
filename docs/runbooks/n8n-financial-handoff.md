# n8n — Finalização financeira de handoff

## Objetivo

O Chatwoot continua servindo apenas para detectar que o humano assumiu o lead. A
conversa marcada como **Resolvida** não devolve mais o contato à IA. Somente a ação
explícita do CRM chama o workflow abaixo e remove a trava Redis.

## 1. Corrigir o workflow `CHATWOOT — CONTROLE DE HANDOFF`

Antes de alterar qualquer nó, duplique o workflow como backup.

No nó **TRATA HANDOFF CHATWOOT**, substitua todo o código por:

```javascript
const body = $json.body ?? {};
const conversation = body.conversation ?? body;

const phone = String(
  conversation.meta?.sender?.phone_number ?? ""
).replace(/\D/g, "");

const labels = conversation.labels ?? [];
const isHumanHandoff = labels.includes("tag_atendimento_humano");

const accepted =
  body.event === "message_created" &&
  body.message_type === "outgoing";

if (!isHumanHandoff || !phone || !accepted) {
  return [];
}

return [
  {
    json: {
      action: "accepted",
      phone,
      bot_name: "cobranca",
    },
  },
];
```

Mantenha a trilha atual:

```text
ASSUMIU → Redis Set → Execute a SQL query
```

O nó `Redis1 (Delete)` pode permanecer desconectado como referência ou ser removido.
Depois desta alteração, um evento `conversation_status_changed` com `status: resolved`
deve parar no nó de código sem tocar no Redis.

## 2. Criar o workflow `CRM — FINALIZA HANDOFF FINANCEIRO`

### Variável de ambiente

No serviço n8n/Easypanel, adicione:

```text
N8N_FINANCIAL_HANDOFF_SECRET=<segredo longo e aleatório>
```

O mesmo valor deve ser configurado no Vercel e no `.env.local` como
`N8N_FINANCIAL_HANDOFF_SECRET`. A URL de produção do webhook deve ser configurada
como `N8N_FINANCIAL_HANDOFF_WEBHOOK`.

### Nós e conexões

```text
Webhook POST /crm-financial-handoff
  → VALIDA PEDIDO CRM (Code)
  → É VÁLIDO? (IF)
      true  → Redis Delete → Respond to Webhook (200)
      false → Respond to Webhook (401 ou 400)
```

Configure o Webhook para responder por meio do nó **Respond to Webhook**.

No nó **VALIDA PEDIDO CRM**, use:

```javascript
const body = $json.body ?? {};
const headers = $json.headers ?? {};
const suppliedSecret = headers["x-financial-handoff-secret"];
const validDestinations = new Set(["devolver_ao_bot", "sem_retorno"]);
const phone = String(body.phone ?? "").replace(/\D/g, "");

if (suppliedSecret !== $env.N8N_FINANCIAL_HANDOFF_SECRET) {
  return [{ json: { ok: false, statusCode: 401, error: "Não autorizado" } }];
}

if (
  typeof body.resolutionId !== "string" ||
  typeof body.leadId !== "string" ||
  body.botName !== "cobranca" ||
  !validDestinations.has(body.destination) ||
  !/^55\d{10,11}$/.test(phone)
) {
  return [{ json: { ok: false, statusCode: 400, error: "Pedido inválido" } }];
}

return [{
  json: {
    ok: true,
    resolutionId: body.resolutionId,
    leadId: body.leadId,
    destination: body.destination,
    botName: body.botName,
    phone,
  },
}];
```

No IF, avalie `{{ $json.ok }}` como verdadeiro.

No Redis Delete da saída verdadeira:

```text
Operation: Delete
Key: {{ $json.botName }}_{{ $json.phone }}_block
```

No Respond to Webhook da saída verdadeira, retorne JSON:

```json
{
  "ok": true,
  "resolutionId": "={{ $json.resolutionId }}"
}
```

No Respond to Webhook da saída falsa, use status code
`={{ $json.statusCode }}` e retorne:

```json
{
  "ok": false,
  "error": "={{ $json.error }}"
}
```

## 3. Follow-up para `sem_retorno`

O desbloqueio Redis é idêntico nos dois destinos. Para `sem_retorno`, conecte a
saída do Redis Delete ao workflow atual que agenda follow-up de cobrança, passando:

```json
{
  "lead_id": "={{ $json.leadId }}",
  "resolution_id": "={{ $json.resolutionId }}",
  "origin": "financial_handoff_sem_retorno"
}
```

Esse workflow precisa usar `resolution_id` como chave idempotente: se o CRM repetir
o mesmo pedido, nenhum segundo follow-up pode ser criado. Não conecte esta etapa
para `devolver_ao_bot`.

## 4. Teste seguro

1. Em uma conversa de teste, uma mensagem humana com `tag_atendimento_humano` cria
   `cobranca_<telefone>_block`.
2. Marcar a conversa como Resolvida não remove a chave.
3. Enviar POST ao novo webhook com segredo válido remove a chave e retorna 200.
4. Repetir o mesmo `resolutionId` não cria outro follow-up.
5. Enviar pedido sem o header secreto retorna 401 e preserva a chave Redis.

## 5. Após validar

- Definir `N8N_FINANCIAL_HANDOFF_WEBHOOK` e
  `N8N_FINANCIAL_HANDOFF_SECRET` no Vercel.
- Definir as mesmas variáveis no `.env.local` de desenvolvimento.
- Rotacionar qualquer chave de serviço do Supabase que tenha sido compartilhada em
  mensagens ou screenshots.
