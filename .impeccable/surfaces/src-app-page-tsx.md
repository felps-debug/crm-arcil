---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components/console/console-shell.tsx","src/components/layout/sidebar.tsx","src/app/globals.css"]
---

# Dashboard

## Scope and mode

The dashboard at `/`, expressed in the shared ARCIL Operations Console system. Mode: Operate.

## Audience and job

Paulo, owner, opens this screen to understand the whole company at a glance. Teams land here first and use it to reach the domain they work in. The same screen also runs on a close-range TV in the office.

## Content and constraints

Show real operational state across Leads, Agentes IA, Cobranças, Follow-ups, Estoque and Atendimento. No invented metrics. Preserve roles, data truth, responsive behavior and the live Supabase subscription. Urgent follow-ups must be conspicuous without requiring interaction.

## Chosen direction

The shared console vocabulary, not a bespoke one. This surface is built from the same `ConsolePage` / `ConsoleCard` / `ConsoleMetric` / `ConsoleStatus` / `ConsoleTable` primitives as every other route, so the dashboard reads as the product's front door rather than as a separate application.

An earlier direction — a monospaced split-flap operations wall with its own CSS module and its own page header — was replaced in August 2026 because it made `/` the only screen in the product with its own visual language. See `DESIGN.md` for the system that supersedes it.

## Composition

1. **Attention band** (conditional): appears only when urgent follow-ups exist; amber card, states the count and links to Cobranças.
2. **Metric row**: six tiles — total leads, leads ativos, agentes habilitados, receita potencial, taxa de resposta, follow-ups urgentes.
3. **Agenda + queues**: a two-thirds `ConsoleTable` of the six domains (domain, state, owner, last signal, next step, each domain linking to its route) beside a one-third panel of open queues with severity-toned counts.
4. **Agents + activity**: a one-third panel of agent load beside a two-thirds stream of recent events.
5. **Funil comercial**: the five commercial stages as labelled bars.

## Component grammar and inventory

| Ingredient | Commitment | Medium |
| --- | --- | --- |
| Page shell | `ConsolePage` with title, subtitle and header actions | shared console primitive |
| Header actions | connection chip, monospaced clock, refresh button | `ConsoleStatus` + `ConsoleButton` |
| Metrics | one reading per tile, no compound tiles | `ConsoleMetric` |
| Agenda | five-column table, one row per domain, each linked | `ConsoleTable` |
| Queues / agents / events | unpadded cards with hairline-divided rows | `ConsoleCard` + `ConsoleStatus` |
| Funnel | labelled bars over a subtle track | semantic HTML/CSS |
| Alert treatment | amber for factual attention; red reserved for real exception | `ConsoleCard` |
| Empty states | every list names what would appear there | semantic HTML/CSS |

Live data arrives via `/api/dashboard/*`, `/api/agents/summary`, `/api/inventory/summary` and a Supabase realtime channel on `leads`, `followups`, `cobranca_log` and `conversations`; the connection chip reflects the subscription status rather than assuming it.
