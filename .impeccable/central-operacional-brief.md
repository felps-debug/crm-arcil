# Central Operacional

## Scope and mode

Replacement visual system for the operational CRM; the dashboard at `/` is the first surface. Mode: Operate.

## Audience and job

Paulo, owner, watches a close-range TV to understand the whole company in real time. Teams use the same system in desktop interfaces to complete focused operational work.

## Content and constraints

Show real operational state across Leads, Agentes IA, Cobranças, Follow-ups, Estoque and Atendimento. Full data may be visible on the owner TV. Alerts must be conspicuous but no interaction is required on TV. Preserve roles, data truth, responsive behavior, and existing functions.

## Chosen direction

Live newsroom rundown wall. Six operational domains appear as horizontal status lanes. A prominent attention ribbon interrupts the normal flow only for critical issues. The live queue and event ticker make automation and human action legible as one continuous operation.

## Approved adaptation

The right-side queue is implemented as **Atividade recente**, not an artificial priority queue. The current data contract exposes event type and timestamp but not a trustworthy severity field. Real attention is represented by the top ribbon from the urgent follow-up count; a per-event priority queue can be restored only when the API provides a factual severity state.

## Approved composition

`.impeccable/mocks/central-operacional-lanes.png`

## Component grammar and inventory

| Ingredient | Commitment | Medium |
| --- | --- | --- |
| Navigation | narrow icon rail, ordered vertically, compact on TV | semantic HTML + Lucide |
| Top status | title + live state + full-width attention ribbon | semantic HTML/CSS |
| Operational lanes | six dense horizontal rows; domain marker, primary state, microtrend, next event | semantic HTML/CSS/SVG |
| Priority queue | narrow right rail with timestamps and severity | semantic HTML/CSS |
| Event ticker | persistent bottom strip for changes across automation and people | semantic HTML/CSS |
| Data marks | mini bars and lines, no decorative illustration | inline SVG |
| Alert treatment | amber or red only for active attention, supported by icon and copy | semantic HTML/CSS + Lucide |

No comp imagery is required in the shipped dashboard; generated comp is a layout and material reference, not a user-facing asset.
