# Cobranças: Kanban financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar a operação financeira em Cobranças, com decisão por boleto e retomada após três dias úteis.

**Architecture:** O Supabase guarda a resolução e a data de retomada. O CRM exibe um Kanban a partir desses registros e da posição atual de boletos. O serviço Python reivindica retornos vencidos, confirma que ainda existem boletos ativos e só então envia nova cobrança.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Vitest, Python 3.12, APScheduler.

---

### Task 1: Agendamento de retorno no Supabase

**Files:**
- Create: `supabase/migrations/20260811_financial_handoff_followup.sql`

- [ ] **Step 1: Criar teste SQL manual antes da alteração.**

```sql
select column_name
from information_schema.columns
where table_name = 'financial_handoff_resolutions'
  and column_name in ('followup_at', 'followup_status');
```

Expected: nenhuma linha antes da migration.

- [ ] **Step 2: Adicionar os campos e estados.**

```sql
alter table public.financial_handoff_resolutions
  add column if not exists followup_at timestamptz,
  add column if not exists followup_status text not null default 'not_applicable'
    check (followup_status in ('not_applicable', 'scheduled', 'processing', 'sent', 'cancelled', 'failed'));

create index if not exists financial_handoff_resolutions_followup_due_idx
  on public.financial_handoff_resolutions (followup_at)
  where destination = 'sem_retorno' and followup_status = 'scheduled';
```

- [ ] **Step 3: Criar a função de três dias úteis e usá-la no RPC existente.**

```sql
create or replace function public.add_business_days(p_start date, p_days integer)
returns date language plpgsql immutable as $$
declare v_date date := p_start; v_added integer := 0;
begin
  while v_added < p_days loop
    v_date := v_date + 1;
    if extract(isodow from v_date) < 6 then v_added := v_added + 1; end if;
  end loop;
  return v_date;
end;
$$;
```

No `insert into financial_handoff_resolutions` de `finalize_financial_handoff`, incluir:

```sql
followup_at = case when p_destination = 'sem_retorno'
  then public.add_business_days(current_date, 3)::timestamptz else null end,
followup_status = case when p_destination = 'sem_retorno'
  then 'scheduled' else 'not_applicable' end
```

- [ ] **Step 4: Criar reserva atômica do retorno vencido.**

```sql
create or replace function public.claim_due_financial_handoff_followups(p_limit integer default 50)
returns table (resolution_id uuid, lead_id uuid, cobranca_log_id uuid, wa_phone text)
language sql security definer set search_path = public as $$
  update public.financial_handoff_resolutions r set followup_status = 'processing'
   where r.id in (
     select id from public.financial_handoff_resolutions
      where destination = 'sem_retorno' and followup_status = 'scheduled' and followup_at <= now()
      order by followup_at for update skip locked limit greatest(1, least(p_limit, 100))
   )
  returning r.id, r.lead_id, r.cobranca_log_id,
    (select wa_phone from public.leads where id = r.lead_id);
$$;
grant execute on function public.claim_due_financial_handoff_followups(integer) to service_role;
```

- [ ] **Step 5: Validar e commitar.**

```sql
select public.add_business_days('2026-08-14', 3); -- 2026-08-19
```

```bash
git add supabase/migrations/20260811_financial_handoff_followup.sql
git commit -m "feat: schedule financial handoff returns"
```

### Task 2: Dados e API do Kanban

**Files:**
- Modify: `src/lib/server/financial-handoff.ts`
- Modify: `src/lib/server/financial-handoff.test.ts`
- Modify: `src/lib/server/crm-data.ts`
- Create: `src/app/api/cobranca/financial-handoffs/route.ts`

- [ ] **Step 1: Escrever testes puros.**

```ts
expect(addBusinessDays(new Date("2026-08-14T12:00:00Z"), 3).toISOString().slice(0, 10)).toBe("2026-08-19");
expect(classifyFinancialHandoff({ handoffAcceptedAt: "2026-08-10T10:00:00Z", resolution: null, openBoletoCount: 2 })).toBe("human");
expect(classifyFinancialHandoff({ handoffAcceptedAt: null, resolution: null, openBoletoCount: 1 })).toBe("awaiting_response");
expect(classifyFinancialHandoff({ handoffAcceptedAt: "2026-08-10T10:00:00Z", resolution: { destination: "sem_retorno", followupStatus: "scheduled" }, openBoletoCount: 1 })).toBe("awaiting_return");
```

- [ ] **Step 2: Implementar tipos e classificação.**

```ts
export type FinancialBoardColumn = "awaiting_response" | "human" | "awaiting_return" | "resolved";
export type FinancialBoardItem = { leadId: string; name: string | null; phone: string; cobrancaLogId: string | null; openBoletoCount: number; openAmount: number; handoffAcceptedAt: string | null; column: FinancialBoardColumn; followupAt: string | null; resolutionId: string | null; n8nStatus: "pending" | "delivered" | "failed" | null; boletos: FinancialHandoffBoleto[]; activeDecisions: FinancialHandoffDecision[]; };
```

`classifyFinancialHandoff` retorna `resolved` sem boletos; `awaiting_return` para `sem_retorno` em `scheduled` ou `processing`; `human` para handoff aceito; e `awaiting_response` nos demais casos.

- [ ] **Step 3: Implementar `getFinancialHandoffBoard`.**

Em `crm-data.ts`, buscar administrativamente `leads` de segmento `COBRANCA`, snapshots de `cobranca_log`, resoluções e decisões. Normalizar telefones pelos últimos oito dígitos, selecionar um snapshot com `metadata.boletos` por lead, excluir documentos com decisão ativa e devolver uma linha por lead.

- [ ] **Step 4: Criar rota autenticada.**

```ts
export async function GET() {
  const { response } = await requireApiPermission("manage_cobranca");
  if (response) return response;
  return Response.json({ items: await getFinancialHandoffBoard() });
}
```

Implementar `POST { resolutionId }` somente para resoluções `failed`, reutilizando `notifyFinancialHandoffN8n` e persistindo `delivered` ou `failed`.

- [ ] **Step 5: Verificar e commitar.**

```bash
npm test -- src/lib/server/financial-handoff.test.ts
npm run typecheck
git add src/lib/server/financial-handoff.ts src/lib/server/financial-handoff.test.ts src/lib/server/crm-data.ts src/app/api/cobranca/financial-handoffs/route.ts
git commit -m "feat: expose financial handoff board"
```

### Task 3: Kanban e formulário reutilizável em Cobranças

**Files:**
- Create: `src/app/cobranca/_components/financial-handoff-form.tsx`
- Create: `src/app/cobranca/_components/financial-handoff-board.tsx`
- Modify: `src/app/cobranca/page.tsx`
- Modify: `src/app/leads/_components/financial-handoff-card.tsx`

- [ ] **Step 1: Extrair o formulário por boleto.**

Criar `FinancialHandoffForm` com as props `leadId`, `cobrancaLogId`, `boletos`, `activeDecisions`, `onSaved` e `onError`. Enviar somente escolhas `pago`/`renegociado`; exigir uma observação quando renegociado; manter `devolver_ao_bot` e `sem_retorno` como destinos.

- [ ] **Step 2: Criar cartões expansíveis e quatro colunas.**

```ts
const columns = [
  ["awaiting_response", "Aguardando resposta"],
  ["human", "Em atendimento humano"],
  ["awaiting_return", "Aguardando retorno"],
  ["resolved", "Resolvido"],
] as const;
```

O cartão fechado mostra nome, telefone, total aberto, quantidade e data “Retoma em DD/MM” se existir. Ao clicar, renderiza o formulário dentro do próprio cartão. A coluna Resolvido é somente leitura.

- [ ] **Step 3: Integrar realtime e abas.**

Adicionar `financial` ao tipo `Tab`, à lista de abas e à animação existente. Recarregar o board quando `cobranca_log`, `financial_handoff_resolutions` ou `cobranca_handoff_boleto_decisions` mudarem.

- [ ] **Step 4: Manter compatibilidade.**

Fazer `FinancialHandoffCard` de Leads usar `FinancialHandoffForm`; manter Monitoramento e o botão legado “Marcar como pago”, com texto indicando que pagamento parcial e renegociação devem ser feitos em Atendimentos financeiros.

- [ ] **Step 5: Verificar e commitar.**

```bash
npm run build
git add src/app/cobranca src/app/leads/_components/financial-handoff-card.tsx
git commit -m "feat: add financial handoff kanban"
```

### Task 4: Retomada automática no serviço Python

**Files:**
- Modify: `D:\Temp\arcil-cobranca-py\db.py`
- Modify: `D:\Temp\arcil-cobranca-py\scheduler.py`
- Create: `D:\Temp\arcil-cobranca-py\tests\test_financial_return.py`

- [ ] **Step 1: Escrever teste fail-closed.**

```py
def test_return_is_cancelled_when_no_active_document(monkeypatch):
    monkeypatch.setattr(db, "tem_boletos_ativos", lambda _: False)
    assert scheduler.should_send_financial_return("5511999999999") is False
```

- [ ] **Step 2: Reservar e concluir retornos.**

Criar `claim_due_financial_returns()` com a RPC e `finish_financial_return(resolution_id, status, error=None)`. Em falha de leitura, tratar como sem documento ativo e não enviar.

- [ ] **Step 3: Agendar a execução.**

Criar `reenviar_retornos_financeiros()` em `scheduler.py`: reservar, checar `tem_boletos_ativos`, respeitar horário comercial, usar o envio existente e salvar `sent`, `cancelled` ou `failed`.

```py
scheduler.add_job(reenviar_retornos_financeiros, "interval", minutes=15,
  id="retornos_financeiros", replace_existing=True,
  name="Retomada de handoffs financeiros vencidos")
```

- [ ] **Step 4: Verificar, commitar e implantar.**

```bash
python -m compileall db.py scheduler.py
pytest -q tests/test_financial_return.py
git add db.py scheduler.py tests/test_financial_return.py
git commit -m "feat: resume due financial handoffs"
git push origin HEAD
```

No EasyPanel, implantar o merge em `main` e confirmar no log a criação do job “Retomada de handoffs financeiros vencidos”.

### Task 5: Validação ponta a ponta

**Files:**
- Modify: `docs/runbooks/n8n-financial-handoff.md`

- [ ] **Step 1: Validar devolução imediata.**

Com três boletos, marcar dois como pagos, devolver ao bot e confirmar que a IA menciona somente o terceiro.

- [ ] **Step 2: Validar Sem retorno.**

Selecionar Sem retorno, confirmar a coluna Aguardando retorno e data de três dias úteis. Em teste, ajustar a data para o passado e confirmar que o serviço só envia se a posição financeira ainda tiver boleto.

- [ ] **Step 3: Rodar a validação final e commitar.**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git add docs/runbooks/n8n-financial-handoff.md
git commit -m "docs: document financial collection operations"
```

## Revisão do plano

- A Task 1 cria a data e o estado únicos para retomada.
- As Tasks 2 e 3 exibem e operam esses dados sem exigir Leads ou Kanban geral.
- A Task 4 é o único produtor de mensagens de retorno e bloqueia envio sem boleto ativo.
- A Task 5 prova os dois destinos e mantém o runbook atualizado.

