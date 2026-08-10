# Controle Financeiro de Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o financeiro finalize um handoff no CRM por boleto, liberando a IA somente por uma ação explícita e nunca pela resolução automática no Chatwoot.

**Architecture:** O CRM grava decisões manuais imutáveis para boletos e um encerramento de handoff em uma função transacional do Postgres. Uma API autenticada chama um webhook interno do n8n somente depois da gravação; o n8n é o único componente que remove a trava Redis. A IA consulta a posição do ERP excluindo decisões manuais ativas até a sincronização confirmar a baixa ou renegociação.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres, Vitest, n8n e Redis.

---

## File map

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260810_financial_handoff_controls.sql` | Tabelas, função transacional, índices e RLS da decisão por boleto. |
| `src/lib/server/financial-handoff.ts` | Validação de payload, leitura de boletos e chamada n8n idempotente. |
| `src/lib/server/financial-handoff.test.ts` | Testes de validação, normalização e seleção de boletos. |
| `src/app/api/leads/[id]/financial-handoff/route.ts` | Endpoint autenticado para finalizar o handoff. |
| `src/lib/env.ts` | Variáveis do webhook e segredo interno. |
| `src/lib/server/crm-data.ts` | Incluir boletos e estado de handoff no detalhe do lead. |
| `src/types/api.ts` | Contrato do detalhe e do formulário financeiro. |
| `src/app/leads/_components/financial-handoff-card.tsx` | Formulário simples de finalização por boleto. |
| `src/app/leads/page.tsx` | Renderizar o cartão no `LeadPanel` e recarregar o detalhe após salvar. |
| `docs/runbooks/n8n-financial-handoff.md` | Configuração auditável dos dois workflows n8n. |

### Task 1: Criar a base transacional de decisões por boleto

**Files:**
- Create: `supabase/migrations/20260810_financial_handoff_controls.sql`
- Test: executar as consultas de verificação no Supabase SQL Editor

- [ ] **Step 1: Criar a tabela de decisões imutáveis e o estado de entrega ao n8n**

```sql
create table public.cobranca_handoff_boleto_decisions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  empresa text not null,
  documento text not null,
  status text not null check (status in ('pago', 'renegociado')),
  note text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint cobranca_handoff_renegociado_note
    check (status <> 'renegociado' or length(trim(coalesce(note, ''))) > 0)
);

create unique index cobranca_handoff_boleto_active_idx
  on public.cobranca_handoff_boleto_decisions (empresa, documento)
  where superseded_at is null;

create table public.financial_handoff_resolutions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  destination text not null check (destination in ('devolver_ao_bot', 'sem_retorno')),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  n8n_status text not null default 'pending' check (n8n_status in ('pending', 'delivered', 'failed')),
  n8n_delivered_at timestamptz,
  n8n_error text
);
```

- [ ] **Step 2: Criar a RPC `finalize_financial_handoff`**

Ela recebe `p_lead_id uuid`, `p_actor_id uuid`, `p_destination text` e `p_decisions jsonb`.
Na mesma transação ela deve: validar `p_destination`; verificar que o lead existe e
tem `handoff_accepted_at`; encerrar decisões ativas para os mesmos documentos;
inserir as novas decisões; inserir uma linha `pending` em
`financial_handoff_resolutions`; e gravar `activity_log` com esta estrutura:

```json
{
  "destination": "devolver_ao_bot",
  "decisions": [
    { "empresa": "PHBLd", "documento": "B1 123 1/2", "status": "pago" }
  ]
}
```

Retornar `resolution_id`, `wa_phone` e `destination`. A função não altera
`cobranca_boletos`: o ERP continua sendo a fonte financeira oficial.

- [ ] **Step 3: Conceder acesso somente ao service role e ativar RLS**

```sql
alter table public.cobranca_handoff_boleto_decisions enable row level security;
alter table public.financial_handoff_resolutions enable row level security;

revoke all on public.cobranca_handoff_boleto_decisions from anon, authenticated;
revoke all on public.financial_handoff_resolutions from anon, authenticated;
revoke all on function public.finalize_financial_handoff(uuid, uuid, text, jsonb) from public;
grant execute on function public.finalize_financial_handoff(uuid, uuid, text, jsonb) to service_role;
```

- [ ] **Step 4: Verificar a migração em uma transação de teste**

No SQL Editor, use um lead de teste com handoff aceito e execute `select * from
public.finalize_financial_handoff(...)`. Confirme uma linha em cada nova tabela e
uma entrada `handoff_financeiro_finalizado` em `activity_log`; execute `rollback`
após a inspeção.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810_financial_handoff_controls.sql
git commit -m "feat: add financial handoff decision storage"
```

### Task 2: Criar o domínio do servidor e seus testes unitários

**Files:**
- Create: `src/lib/server/financial-handoff.ts`
- Create: `src/lib/server/financial-handoff.test.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Escrever testes de validação antes da implementação**

Cobrir `parseFinancialHandoffPayload` com estes casos:

```ts
expect(() => parseFinancialHandoffPayload({ destination: "pago", decisions: [] })).toThrow("Destino inválido");
expect(() => parseFinancialHandoffPayload({ destination: "devolver_ao_bot", decisions: [{ empresa: "PHBLd", documento: "B1", status: "renegociado" }] })).toThrow("Informe a observação da renegociação");
expect(parseFinancialHandoffPayload({ destination: "sem_retorno", decisions: [{ empresa: "PHBLd", documento: "B1", status: "pago" }] })).toEqual({
  destination: "sem_retorno",
  decisions: [{ empresa: "PHBLd", documento: "B1", status: "pago", note: null }],
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/server/financial-handoff.test.ts`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar validação e entrega idempotente**

Exportar os tipos abaixo e uma função `notifyFinancialHandoffN8n`. Ela envia
`resolutionId`, `leadId`, `phone` normalizado, `destination` e `botName: 'cobranca'`
para `N8N_FINANCIAL_HANDOFF_WEBHOOK`, com o cabeçalho
`x-financial-handoff-secret`. A função deve falhar de forma explícita se URL ou
segredo estiverem vazios.

```ts
export type FinancialHandoffDecision = {
  empresa: string;
  documento: string;
  status: "pago" | "renegociado";
  note: string | null;
};

export type FinancialHandoffPayload = {
  destination: "devolver_ao_bot" | "sem_retorno";
  decisions: FinancialHandoffDecision[];
};
```

Adicionar ao final de `src/lib/env.ts`:

```ts
export const N8N_FINANCIAL_HANDOFF_WEBHOOK = clean(process.env.N8N_FINANCIAL_HANDOFF_WEBHOOK);
export const N8N_FINANCIAL_HANDOFF_SECRET = clean(process.env.N8N_FINANCIAL_HANDOFF_SECRET);
```

- [ ] **Step 4: Rodar o teste e a checagem de tipos**

Run: `npm test -- src/lib/server/financial-handoff.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/financial-handoff.ts src/lib/server/financial-handoff.test.ts src/lib/env.ts
git commit -m "feat: validate financial handoff actions"
```

### Task 3: Expor boletos e estado do handoff no detalhe do lead

**Files:**
- Modify: `src/lib/server/crm-data.ts`
- Modify: `src/types/api.ts`
- Test: `src/lib/server/financial-handoff.test.ts`

- [ ] **Step 1: Estender o contrato HTTP**

Adicionar ao `LeadDetailResponse`:

```ts
financialHandoff: {
  eligible: boolean;
  activeDecisions: { empresa: string; documento: string; status: "pago" | "renegociado"; note: string | null; recordedAt: string }[];
  boletos: { empresa: string; documento: string; valor: number; juros: number | null; multa: number | null; vencimento: string | null; statusErp: string | null }[];
} | null;
```

- [ ] **Step 2: Implementar as leituras no `getLeadDetail`**

Quando `lead.segment === 'COBRANCA'` e `lead.wa_phone` existir, buscar
`cobranca_boletos` com `aberto = true`, normalizando o telefone no Postgres pelos
últimos oito dígitos. Buscar as decisões ativas da nova tabela pelo `lead_id`.

`eligible` deve ser verdadeiro somente se `handoff_accepted_at` estiver preenchido.
Não use `handoff_sent_at`: ele significa que a mensagem saiu, não que alguém assumiu.

- [ ] **Step 3: Rodar typecheck**

Run: `npm run typecheck`

Expected: PASS, sem alterar contratos não relacionados.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/crm-data.ts src/types/api.ts
git commit -m "feat: expose financial handoff detail"
```

### Task 4: Criar endpoint autenticado de finalização

**Files:**
- Create: `src/app/api/leads/[id]/financial-handoff/route.ts`
- Modify: `src/lib/server/financial-handoff.ts`

- [ ] **Step 1: Criar teste de integração da rota com dependências simuladas**

Verificar respostas: 401 sem sessão, 403 sem `manage_cobranca`, 400 para payload
inválido, 502 quando o webhook n8n falhar e 200 para entrega confirmada.

- [ ] **Step 2: Implementar `POST` seguindo o padrão de autorização existente**

O handler deve usar `requireApiPermission('manage_cobranca')`, validar o body,
executar `finalize_financial_handoff` com `createAdminClient().rpc`, chamar o n8n e
atualizar `financial_handoff_resolutions` para `delivered` ou `failed`.

Resposta de sucesso:

```json
{ "ok": true, "resolutionId": "uuid", "destination": "sem_retorno" }
```

Resposta quando o banco gravou mas o n8n falhou:

```json
{ "ok": false, "pending": true, "error": "Não foi possível devolver o atendimento ao bot." }
```

Nesse caso, não repita a RPC; crie depois um reprocessador administrativo que usa o
mesmo `resolutionId` para evitar decisões duplicadas.

- [ ] **Step 3: Rodar testes, lint e typecheck**

Run: `npm test && npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/leads/[id]/financial-handoff/route.ts src/lib/server/financial-handoff.ts src/lib/server/financial-handoff.test.ts
git commit -m "feat: finalize financial handoffs through crm"
```

### Task 5: Construir o cartão simples para o financeiro

**Files:**
- Create: `src/app/leads/_components/financial-handoff-card.tsx`
- Modify: `src/app/leads/page.tsx`

- [ ] **Step 1: Criar o componente com estados locais mínimos**

Receber `LeadDetailResponse`, `onSaved` e renderizar somente quando
`detail.financialHandoff?.eligible === true`. Para cada boleto, usar um `<select>`
com `Manter em aberto`, `Pago` e `Renegociado`; ao selecionar renegociação, mostrar
um campo de observação. No rodapé, usar rádio para `Devolver ao bot` e `Sem retorno`.

Texto de proteção exibido sempre:

```text
Boletos marcados como pagos ou renegociados não serão cobrados pela IA enquanto o ERP atualiza.
```

- [ ] **Step 2: Impedir confirmação ambígua no navegador**

Desabilitar o botão enquanto salva, se houver renegociação sem observação, ou se não
houver boleto disponível. Enviar somente decisões `pago` e `renegociado`; `em_aberto`
não vai no payload.

- [ ] **Step 3: Conectar ao painel atual**

No `LeadPanel` de `src/app/leads/page.tsx`, renderizar o cartão antes de
"Histórico recente". No retorno 200, executar o callback que incrementa
`refreshTick` para buscar o detalhe atualizado; no erro pendente, manter as escolhas
e mostrar a mensagem retornada pela API.

- [ ] **Step 4: Verificar a interface manualmente**

Run: `npm run dev`

Em `/leads`, abrir um lead de cobrança com `handoff_accepted_at`; confirmar que dois
boletos aparecem, que um pode ser marcado Pago sem afetar o outro e que
Renegociado exige observação.

- [ ] **Step 5: Rodar a suíte e commit**

```bash
npm test && npm run lint && npm run typecheck
git add src/app/leads/_components/financial-handoff-card.tsx src/app/leads/page.tsx
git commit -m "feat: add financial handoff controls to lead detail"
```

### Task 6: Alterar e documentar os workflows n8n

**Files:**
- Create: `docs/runbooks/n8n-financial-handoff.md`

- [ ] **Step 1: Tornar seguro o workflow já ativo**

No `CHATWOOT — CONTROLE DE HANDOFF`, remova a condição `released` e a conexão
`LIBEROU -> Redis1 (Delete)`. O código deve retornar item somente para aceite:

```javascript
const accepted = body.event === "message_created" && body.message_type === "outgoing";
if (!isHumanHandoff || !phone || !accepted) return [];
return [{ json: { action: "accepted", phone, bot_name: "cobranca" } }];
```

Marcar uma conversa como Resolvida no Chatwoot deve terminar no nó de código e a
chave Redis deve permanecer existente.

- [ ] **Step 2: Criar `CRM — FINALIZA HANDOFF FINANCEIRO`**

Workflow:

```text
Webhook (POST, header x-financial-handoff-secret)
  -> valida segredo e destination
  -> Redis Delete: {{ $json.botName }}_{{ $json.phone }}_block
  -> se destination = sem_retorno: chama o fluxo existente de follow-up com resolutionId idempotente
  -> Respond to Webhook 200 { ok: true, resolutionId }
```

O webhook recusa com 401 segredo ausente/incorreto, 400 `destination` fora de
`devolver_ao_bot|sem_retorno` e não usa IDs, chaves ou telefone provenientes de
expressões sem validação.

- [ ] **Step 3: Ajustar a consulta da posição no agente de cobrança**

Na consulta que alimenta `MEMORIA_LONGA`, trocar a fonte por uma view que exclui
decisões manuais ativas:

```sql
select b.*
from cobranca_boletos b
where b.aberto
  and not exists (
    select 1
    from cobranca_handoff_boleto_decisions d
    where d.empresa = b.empresa
      and d.documento = b.documento
      and d.superseded_at is null
  );
```

- [ ] **Step 4: Registrar o runbook e validar em ambiente de teste**

Documentar IDs dos workflows, URL sem segredo, nó de Redis e testes: pagamento
parcial, renegociação, sem retorno, conversa resolvida sem ação CRM e repetição do
mesmo `resolutionId`.

- [ ] **Step 5: Commit**

```bash
git add docs/runbooks/n8n-financial-handoff.md
git commit -m "docs: add financial handoff n8n runbook"
```

### Task 7: Teste de aceitação e lançamento controlado

**Files:**
- Modify: `.env.local` (somente local; não versionar)
- Modify: ambiente Vercel (variáveis de produção)

- [ ] **Step 1: Configurar segredos**

Definir valores idênticos e aleatórios para:

```text
N8N_FINANCIAL_HANDOFF_WEBHOOK=https://<n8n>/webhook/crm-financial-handoff
N8N_FINANCIAL_HANDOFF_SECRET=<segredo-longo>
```

Inserir ambos no `.env.local`, no serviço n8n e nas variáveis do projeto Vercel. O
segredo nunca deve aparecer em nós, screenshots, commits ou logs.

- [ ] **Step 2: Executar cenário de pagamento parcial**

1. Criar lead de teste com dois boletos abertos e handoff aceito.
2. Marcar apenas um boleto como Pago e selecionar Devolver ao bot.
3. Confirmar `n8n_status = delivered` e ausência da chave Redis.
4. Enviar mensagem do cliente e confirmar que a IA cita somente o boleto restante.

- [ ] **Step 3: Executar cenário de renegociação e sem retorno**

1. Marcar um boleto Renegociado com observação.
2. Confirmar que a IA não cita esse documento antes de o ERP atualizar.
3. Selecionar Sem retorno em outro lead, confirmar desbloqueio e apenas um
   follow-up reativado.

- [ ] **Step 4: Executar cenário de segurança**

1. Marcar a conversa como Resolvida no Chatwoot sem usar o CRM.
2. Confirmar que o Redis não foi apagado.
3. Chamar o webhook sem o header secreto e confirmar 401.
4. Simular indisponibilidade do n8n e confirmar que o CRM mostra ação pendente,
   mantém Redis e não duplica decisões ao reprocessar.

- [ ] **Step 5: Revisar e entregar**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: todos os testes e build passam. Registrar no handoff o ID da resolução
de teste, o horário e o operador que a executou.
