---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/layout/sidebar.tsx","src/app/globals.css"]
---

# Central Operacional

## Scope and mode

Replacement visual system for the operational CRM; the dashboard at `/` is the first surface. Mode: Operate.

## Audience and job

Paulo, owner, watches a close-range TV to understand the whole company in real time. Teams use the same system in desktop interfaces to complete focused operational work.

## Content and constraints

Show real operational state across Leads, Agentes IA, Cobranças, Follow-ups, Estoque and Atendimento. Full data may be visible on the owner TV. Alerts must be conspicuous but no interaction is required on TV. Preserve roles, data truth, responsive behavior, and existing functions.

## Chosen direction

Operational split-flap wall. Every queue, domain state, agent and recent event is exposed as a fixed-column board, with no card-grid summary and no need to click to discover active work. Matte charcoal, warm display data, restrained blue for live state, amber for factual attention and red for actual exception.

## Approved composition

`.impeccable/mocks/operacao-agora-split-flap.png` (generated direction reference; the shipping surface uses only real CRM data).

## Component grammar and inventory

| Ingredient | Commitment | Medium |
| --- | --- | --- |
| Navigation | narrow icon rail, ordered vertically, compact on TV | semantic HTML + Lucide |
| Top status | time, live state and a dominant factual attention signal | semantic HTML/CSS |
| Central agenda | six fixed-column rows: domain, state, responsible, last signal and next step | semantic HTML/CSS |
| Open queues | all available pending categories and all registered agents, without a visual truncation cap | semantic HTML/CSS |
| Event stream | complete recent activity list with source and timestamp | semantic HTML/CSS |
| Footer ledger | always-visible operational totals and ERP state | semantic HTML/CSS |
| Alert treatment | amber only for factual attention; red only for actual exception | semantic HTML/CSS |

No comp imagery is required in the shipped dashboard; generated comp is a layout and material reference, not a user-facing asset.
