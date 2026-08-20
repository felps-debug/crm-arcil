# Operational Wall — ARCIL CRM

## Overview

New real-time monitoring interface inspired by Amazon Logistics operational centers. Combines ARCIL brand colors, dense typography, and live data subscriptions for monitoring AC sales, IA agents, billing operations, and inventory simultaneously.

## Architecture

```
src/
  app/operacoes/
    page.tsx                 → Landing page (Central Operacional)
    leads/page.tsx           → Lead pipeline (kanban/table/card views)
    cobranca/page.tsx        → Billing queue + financial ledger
    agentes/page.tsx         → AI fleet monitoring
  components/
    operational-wall.tsx     → Reusable OperationalWall component
    operational-wall.css     → Unified styling (600+ lines)
```

## Pages

### `/operacoes` — Central Operacional

Hero section showing:
- Active agents count
- Active conversations
- Lead processing status
- System health signal (live/connecting/offline)

3-column main grid:
1. **Agents panel** — Top 5 active agents + segment + conversation count
2. **Work queue** — Próximos passos (3 action types with severity colors)
3. **Inventory** — Product status (in stock / low / out of stock)

Bottom grid:
1. **Events stream** — Recent system operations
2. **Financial ledger** — Portfolio / Received / Risk summary

Real-time subscriptions: leads, followups, cobranca_log, conversations

### `/operacoes/leads` — Leads Pipeline

Three view modes (toggle buttons):

**Kanban** (default):
- 5 columns: NOVO → CONVERSANDO → FOLLOWUP → ENCAMINHADO → PERDIDO
- Stage-specific header colors (amber for new/followup, green for active, red for lost)
- Card shows name, company, phone, action button
- Animated entrance + staggered

**Table**:
- Columns: Nome, Empresa, Status, Responsável, Ação
- Compact row layout
- Status badge with color coding

**Cards**:
- Grid layout (auto-fill, 2-3 columns)
- Each card is its own Kanban card

Real-time: updates on any lead table change

### `/operacoes/cobranca` — Billing Operations

Status overview:
- Pending (amber icon) — count with icon
- Overdue (red icon) — count with icon
- Paid (green icon) — count with icon

Billing queue:
- 5 sample rows showing: name, status (pending/overdue), days late/to due, value
- Colored left border: info/warning/danger based on severity

Financial ledger:
- Total Portfolio
- Received (green)
- Em Aberto (pending)
- Risco (red, overdue)

All formatted with Brazilian currency format (formatMoney)

### `/operacoes/agentes` — AI Fleet Monitoring

Hero section:
- Active agent count
- Segment count
- Active conversation count
- Live status signal

Agent grid:
- Auto-fill grid, 280px minimum column width
- Each agent card shows:
  - Signal dot (active/inactive with color)
  - Agent name + segments
  - Status badge (ATIVO/PAUSADO)
  - 3-cell metrics grid: Leads Ativos, Conversas, Perdidos
  - Footer: conversion rate trend

Summary ledger:
- Agentes Totais
- Ativos Agora
- Total de Conversas
- Taxa de Conversão (%)

Real-time: updates on conversations table change

## Design System

New aesthetic separate from Split-Flap DESIGN.md.

### Colors (ARCIL Brand)
```css
--op-graphite: #161719        (base)
--op-cabinet: #151618         (bg)
--op-charcoal: #202123        (surface hover)
--op-ivory: #f0ede4           (text primary)
--op-blue: #4ea7ff            (info, metrics)
--op-green: #70d8a1           (success, live status)
--op-amber: #ffc14c           (warning)
--op-red: #ff7465             (danger, overdue)
--op-violet: #c29bff          (special)
--op-cyan: #67d7e6            (ledger values)
```

### Typography
- Montserrat (headings, UI)
- IBM Plex Mono (numeric values, prices)
- Dense: 10-14px for data-heavy displays
- Tracking: 0.05-0.08em on labels

### Responsive
- **1200px**: 3-col → 2-col main grid
- **768px**: Stacked single column, header wraps
- **1920px+**: TV mode with clamp() scaling (fonts 1.2-3vw)

### Animations
- Framer Motion fade + y-translate on entrance (initial={{ opacity: 0, y: 10 }})
- Staggered container children
- Pulse keyframes on signal dots (live/connecting states)
- Hover: border color shifts to blue, background lifts
- Smooth 0.2s transitions on all interactive elements

## Real-Time Features

Each page subscribes to Supabase postgres_changes:

| Page | Tables | Triggers |
|------|--------|----------|
| `/operacoes` | leads, followups, cobranca_log, conversations | Refreshes summary metrics |
| `/leads` | leads | Reorders cards into stages |
| `/cobranca` | cobranca_log | Updates queue counts |
| `/agentes` | conversations | Recalculates agent metrics |

Implementation:
```typescript
useEffect(() => {
  const supabase = createClient();
  const refresh = () => setRefreshTick((t) => t + 1);
  const channel = supabase.channel("rt-topic")
    .on("postgres_changes", { event: "*", schema: "public", table: "table_name" }, refresh)
    .subscribe();
  return () => supabase.removeChannel(channel);
}, []);
```

Refresh tick triggers API re-fetch with cache-busting `?_r=${refreshTick}`.

## Navigation

Added to sidebar (src/components/layout/sidebar.tsx):

```typescript
const NAV = [
  { href: "/operacoes", label: "Operações", icon: Gauge },
  { href: "/operacoes/leads", label: "Leads", icon: Users, badge: true },
  { href: "/operacoes/agentes", label: "Agentes IA", icon: Bot },
  { href: "/operacoes/cobranca", label: "Cobranças", icon: CreditCard, perm: "manage_cobranca" },
  // ... legacy pages below
];
```

Routes positioned at top of nav for primary access. "Dashboard (Old)" kept for backward compatibility.

## API Endpoints Used

```
GET /api/dashboard/summary           → DashboardSummaryResponse
GET /api/agents/summary              → AgentSummaryResponse
GET /api/dashboard/pending-center    → PendingCenterResponse
GET /api/inventory/summary           → InventorySummaryResponse
GET /api/leads                       → LeadsResponse
```

Each endpoint is called on page load + whenever real-time event fires. All responses have `?_r=${refreshTick}` cache-busting parameter.

## Next Steps

1. **Wire API endpoints** — Replace mock data with real responses from backend
2. **Test authentication** — Verify logged-in users see data
3. **Add interactivity** — Click on lead → detail view, agent → conversations, etc.
4. **Refine responsive** — Test on tablets/phones
5. **TV mode testing** — Verify 1920px+ viewport scaling
6. **Performance** — Monitor subscription count + event frequency
7. **Status indicators** — Connect real Supabase connection state to header signal dot

## File Changes Summary

**Created:**
- src/app/operacoes/page.tsx
- src/app/operacoes/leads/page.tsx
- src/app/operacoes/cobranca/page.tsx
- src/app/operacoes/agentes/page.tsx
- src/components/operational-wall.tsx
- src/components/operational-wall.css (600+ lines)

**Modified:**
- src/components/layout/sidebar.tsx (added 4 nav items)
- PRODUCT.md (noted in git)

**Total files:** 6 new pages/components + sidebar integration
**Total lines:** ~800 TypeScript + 600 CSS
**Design scope:** New system independent of DESIGN.md
