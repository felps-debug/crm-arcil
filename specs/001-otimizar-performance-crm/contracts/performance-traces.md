# Contrato: Traços de Performance

Schema da tabela em [data-model.md §1](../data-model.md).

## Propagação

- O browser gera `traceId = crypto.randomUUID()` por jornada: abrir o dashboard, voltar à tela ou abrir o login.
- Toda request da jornada leva `x-trace-id: <traceId>`.
- O servidor usa o id recebido, se for UUID válido, ou gera um. Ele sai no body do snapshot e no header `x-trace-id` da resposta.

## Etapas do servidor (gravadas pela rota, depois da resposta, com `after()`)

| stage | O que mede |
|---|---|
| `auth` | `getClaims()` |
| `profile` | leitura de `user_profiles` |
| `core` | `fetchCore()` |
| `products` | `rpc('product_metrics')` |
| `section:<nome>` | cálculo em memória de cada seção |
| `total` | handler inteiro; `supabase_requests` = total de requests ao Supabase nesta request |

`supabase_requests` é contado por um contador em `AsyncLocalStorage` incrementado em `fetchWithSupabaseTimeout`.

## `POST /api/perf/traces` (etapas do browser)

```ts
// request body
{ traceId: string; journey: "dashboard" | "leads" | "login" | "other";
  loadKind: "cold" | "warm";
  stages: Array<{ stage: "ttfb" | "ready" | "hydrated" | "revalidated"; durationMs: number; outcome: "ok" | "error" | "timeout" }> }
```

- Auth: `requireApiUser()`. O `user_id` vem dos claims, **nunca** do body.
- Validação: `traceId` é UUID, `stage` está na allowlist, `0 <= durationMs < 600000`, no máximo 20 etapas. Qualquer outro campo é ignorado.
- Resposta: `202` sem corpo. Falha de gravação é logada no servidor e **não** chega ao usuário.
- Envio: `navigator.sendBeacon` quando der, e `fetch(keepalive)` como fallback.
- Rate limit: entra no `RATE_LIMITS` do `proxy.ts` com 60/min por IP.

## Proibido gravar (RF-021)

Tokens, cookies, headers de auth, e-mail, telefone, nome, valores monetários, query string e corpo de request ou response.

## Consulta de diagnóstico (superadmin)

```sql
select trace_id, origin, stage, duration_ms, outcome, supabase_requests, region
from performance_traces
where trace_id = $1
order by origin desc, created_at;
```
