# Contrato: Invalidação por Realtime e Cache de Tela

## Store de cache (`useApi`)

```ts
useApi<T>(url: string | null, opts?: { freshMs?: number /* default 30_000 */ }):
  { data: T | null; loading: boolean; isInitialLoading: boolean; error: string | null;
    isStale: boolean; revalidate: () => void }

invalidate(match: string | ((key: string) => boolean)): void   // marca como velho e revalida quem estiver montado
clearApiCache(): void                                            // chamado no SIGNED_OUT
```

Regras (RF-012, RF-013, clarificação Q1):
- A chave é a URL sem `_r`. Store em `Map` no nível do módulo. **Nunca** escrever em `localStorage`, `sessionStorage` ou IndexedDB.
- Montar com uma entrada fresca (< 30 s) → devolve `data` na hora, sem request.
- Montar com uma entrada velha → devolve `data` na hora e revalida em segundo plano (`loading = true`, `isInitialLoading = false`).
- Resposta com `seq < acceptedSeq` é descartada.
- Falha com `data` presente → mantém `data` e seta `error` e `isStale = true`. A UI mostra um aviso não bloqueante.
- Duas montagens com a mesma chave compartilham a request em voo.
- `useSupabase` recebe o mesmo comportamento via uma chave explícita (`useSupabase(key, fn, deps)`).

## Mapa origem → seções (dashboard)

| Tabela | Seções |
|---|---|
| `leads` | summary, pending, agents, activity |
| `followups` | summary, pending, urgentFollowups, activity |
| `cobranca_log` | summary, pending, activity |
| `conversations` | summary, agents |

- Janela de **2.000 ms** por lote. Eventos dentro da janela acumulam a união das seções.
- Ao fechar a janela: **uma** request `GET /api/dashboard/snapshot?sections=<união ordenada>`, e o resultado é mesclado seção a seção no estado atual. Seções não pedidas ficam intactas.
- Unmount: `clearTimeout` + `removeChannel`. Evento que chega depois do unmount não faz nada.
- `/leads` e `/cobranca` mantêm os canais próprios, mas passam a usar a mesma janela de 2 s e `invalidate()` em vez de trocar `_r` na URL.

## Contagem de follow-ups urgentes (RF-015)

- `UrgentFollowupsProvider` expõe `{ count, setFromSnapshot(n), refresh() }`.
- Fontes de atualização: seção `urgentFollowups` do snapshot (dashboard aberto) e intervalo de 5 min (o mesmo que a sidebar já tem). **Uma** request por vez (dedup em voo).
- Sidebar e dashboard **só leem** do contexto. `getUrgentFollowupsCount` deixa de ser chamado direto pelos componentes.
