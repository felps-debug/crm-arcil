# Contrato: `GET /api/dashboard/snapshot`

Substitui, **para o dashboard**, as 4 chamadas paralelas (`/api/dashboard/summary`, `/api/dashboard/pending-center`, `/api/agents/summary` e `/api/inventory/summary?scope=summary`) e as 2 queries do browser (`getRecentActivity` e `getUrgentFollowupsCount`). As rotas antigas continuam existindo para `/agentes` e `/demanda-estoque` e passam a delegar às mesmas funções de seção.

## Request

```
GET /api/dashboard/snapshot?sections=summary,pending,agents,inventory,activity,urgentFollowups
x-trace-id: <uuid v4>   (opcional; se ausente o servidor gera um)
```

- `sections` é opcional. Sem ele, vêm todas. Com ele, só as listadas (é o que o Realtime usa, ver [realtime-invalidation.md](./realtime-invalidation.md)).
- Nome de seção desconhecido → `400 { error: "Seção inválida: <nome>" }`.

## Autorização (RF-002, RF-009)

1. Uma chamada a `resolveApiContext()`: `auth.getClaims()` (verificação local ES256) e depois **uma** leitura de `user_profiles(role, permissions)` via admin client.
2. Sem claims válidos → `401 { error: "Unauthorized" }`.
3. Por seção, as **mesmas** regras de hoje:

| Seção | Regra atual preservada |
|---|---|
| summary, pending, agents | usuário autenticado (`requireApiUser`), como nas rotas atuais |
| activity, urgentFollowups | role de staff (`role` ≠ `client` e não vazio). Hoje essas leituras saem do browser e passam pela RLS `staff_read_*`. No servidor elas vão pelo admin client, então a regra da RLS precisa ser reaplicada explicitamente, senão a role `client` passaria a ver dados que hoje não vê |
| inventory | `role in (superadmin, owner)` **ou** `permissions.manage_estoque === true` (`requireApiPermission("manage_estoque")`) |

Seção sem permissão → `{ status: "forbidden" }`. Nada de 403 na rota inteira, pra não derrubar as outras seções.

## Response `200`

```ts
type SectionResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string }      // mensagem genérica, sem detalhe do Postgres
  | { status: "forbidden" };

type DashboardSnapshotResponse = {
  generatedAt: string;          // ISO; mesmo instante para todas as seções
  traceId: string;
  sections: Partial<{
    summary: SectionResult<DashboardSummaryResponse>;
    pending: SectionResult<PendingCenterResponse>;
    agents: SectionResult<AgentSummaryResponse>;
    inventory: SectionResult<Pick<InventorySummaryResponse, "estoqueSincronizado" | "metrics">>;
    activity: SectionResult<ActivityItem[]>;
    urgentFollowups: SectionResult<{ count: number }>;
  }>;
};
```

Os tipos internos (`DashboardSummaryResponse` etc.) são os de `src/types/api.ts`, **sem mudança de forma**. Os números podem mudar só onde hoje estão errados por truncamento.

## Headers de resposta

- `Server-Timing: auth;dur=12, profile;dur=18, core;dur=95, products;dur=40, total;dur=170`
- `Cache-Control: private, no-store`

## Orçamento de leituras (CS-003)

| Leitura | Qtd |
|---|---|
| `user_profiles` (perfil) | 1 |
| `leads`, `followups`, `conversations`, `vendors`, `cobranca_log`, `quotes`, `sales` (via `fetchCore`, 1 página cada no volume atual) | 7 |
| `cobranca_handoff_boleto_decisions` | 1 |
| `rpc('product_metrics')` | 1 |
| `sheet_sources(id,last_synced_at)` | 1 |
| urgentFollowups (`count head`) | 1 |
| **Total** | **12** |

`activity` sai de `leads`, `cobranca_log` e `followups` já carregados. Nenhuma tabela é lida duas vezes.

## Erros

- Falha numa seção → aquela seção vem com `status: "error"`, as outras seguem `ok`, e a resposta é `200`.
- Falha em auth, perfil ou `fetchCore` (dependências comuns) → as seções que dependem delas vêm com `error`. Se nenhuma seção der certo, `500 { error: "Erro interno. Tente novamente." }`.
