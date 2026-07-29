# ARCIL CRM Backend API Contracts

All endpoints require an authenticated Supabase session. The API uses the service-role client only server-side, after authentication.

## Shared Metric Shape

```ts
type ApiMetric = {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  formula: string;
  period: { label: string; from: string | null; to: string | null };
  previous: { label: string; value: number | string | null; deltaPercent: number | null };
  tooltip: string;
  drilldown: { href: string; filters: Record<string, string> };
};
```

## Endpoints

### `GET /api/dashboard/summary`

Returns dashboard metrics, commercial funnel, commercial indicators, and lead breakdowns.

Current corrected formulas:
- `total_leads`: `count(leads)`.
- `active_leads`: `count(leads where status = ACTIVE)`.
- `followup_response_rate`: `responded sent followups / sent followups`.
- `agents_enabled`: `count(vendors where active = true)`.
- Inventory is not read from `products_cache`; stock APIs use the real segmented product tables.

### `GET /api/dashboard/pending-center`

Returns actionable pending items:
- Leads without owner.
- Active leads without follow-up.
- Follow-ups estimated late.
- Collections due today.
- Stale integrations from `sheet_sources`.
- Products without stock.

### `GET /api/leads`

Query params:
- `segment`
- `status`
- `city`
- `origin`
- `responsible`
- `search`
- `unassigned=true`
- `withoutFollowup=true`
- `limit`, capped at 500

Returns normalized lead rows for table/cards/Kanban.

### `GET /api/leads/[id]`

Returns a commercial lead record with:
- Main lead data.
- Summary counts.
- Next action.
- Timeline from lead creation, conversations, messages, follow-ups, collections, generated images, quotes, and sales.

Generated images are matched by phone number until the database gets a real `lead_id` on `generated_images`.

### `GET /api/agents/summary`

Returns:
- Agent metrics: configured, enabled, online unavailable, served today.
- Agent rows from `vendors`.

The `agents_online` metric and the Integracoes tab were removed: the schema has no heartbeat/connection status to back a real "online" indicator, so a fake one was removed instead of shipped.

### `GET /api/agents/[id]/conversations`

Returns conversations + messages for a single vendor (agent), used by the "Conversas" viewer on `/agentes`.

### `GET /api/inventory/summary`

Also returns `outOfStockRequests` sourced from the `out_of_stock_requests` table (products agents could not find in stock), used by the "Demanda nao atendida" panel on `/demanda-estoque`.

### `GET /api/inventory/summary`

Query params:
- `search`
- `limit`, capped at 1000

Unifies products from:
- `products_consumer`
- `products_reseller`
- `products_installer`
- `products_builder_architect`

Returns product rows and metrics for total products, out of stock, and low stock.

## Schema Constraints

No database schema changes were made for this backend pass.

Known gaps that require approval before schema changes:
- Pipeline stages per segment.
- Stable opportunity records.
- Real agent online/error heartbeat.
- `generated_images.lead_id`.
- Lead tags and structured next-action due dates.
