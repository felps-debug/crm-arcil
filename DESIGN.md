---
name: ARCIL Split-Flap Operations Wall
description: A continuously visible operational wall for queues, agenda, activity, and ledger state.
colors:
  graphite-base: "#161719"
  cabinet-black: "#151618"
  board-charcoal: "#202123"
  header-black: "#111214"
  metal-border: "#36383a"
  gridline: "#414244"
  ivory-display: "#f0ede4"
  queue-text: "#c9c9c4"
  ledger-muted: "#a09f98"
  live-blue: "#4ea7ff"
  state-blue: "#68aef8"
  signal-green: "#70d8a1"
  attention-amber: "#ffc14c"
  exception-red: "#ff7465"
  automation-violet: "#c29bff"
  followup-cyan: "#67d7e6"
typography:
  display:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "clamp(20px, 2vw, 34px)"
    fontWeight: 700
    letterSpacing: "0.16em"
  brand:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "clamp(22px, 2.2vw, 40px)"
    fontWeight: 700
    letterSpacing: "0.12em"
  data:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.025em"
  label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "9px"
    fontWeight: 700
    letterSpacing: "0.1em"
rounded:
  status-dot: "50%"
spacing:
  page: "18px"
  section: "12px"
  panel: "13px 15px"
  ledger: "16px 18px"
components:
  operations-header:
    backgroundColor: "{colors.header-black}"
    textColor: "{colors.ivory-display}"
    padding: "0 24px"
    height: "76px"
  agenda-row:
    backgroundColor: "{colors.board-charcoal}"
    textColor: "{colors.ivory-display}"
    padding: "0 13px"
    height: "47px"
  queue-row:
    backgroundColor: "{colors.cabinet-black}"
    textColor: "{colors.queue-text}"
    padding: "0 6px"
    height: "35px"
  event-row:
    backgroundColor: "{colors.cabinet-black}"
    textColor: "{colors.state-blue}"
    padding: "0 13px"
    height: "37px"
  footer-ledger:
    backgroundColor: "#17181a"
    textColor: "{colors.live-blue}"
    padding: "16px 18px"
    height: "90px"
---

# Design System: ARCIL Split-Flap Operations Wall

## Overview

**Creative North Star: "The Always-On Operations Wall"**

ARCIL is a dark, all-open operational board built to be read like a split-flap departures wall: firm divisions, monospaced signals, and a fixed scan order. It makes the entire operating picture visible at once—open queues, current agenda, agents, event stream, and ledger—rather than asking the owner to navigate through a dashboard hierarchy.

The surface is deliberately utilitarian. Charcoal and graphite form a single equipment-like field; ivory characters and colored state values provide the information hierarchy. Color is factual state marking, while borders, columns, and uppercase labels do the structural work.

**Key Characteristics:**

- Everything operational remains simultaneously visible in a three-panel wall and bottom ledger.
- IBM Plex Mono owns the wall’s voice: timing, labels, values, and table-like scan rhythm.
- Hairline metal dividers create slots, columns, and ledger cells instead of soft card depth.
- Blue is live/default state; amber, red, green, violet, and cyan encode real operational distinctions.

## Colors

The palette resembles a dark equipment cabinet with illuminated split-flap text: neutral structure first, sparse color signals second.

### Primary

- **Live Blue:** current connection state, default agenda value, and ledger output.
- **Signal Green:** stable conditions, enabled agents, healthy state, and lead activity.
- **Automation Violet:** AI-agent state in the central agenda.
- **Follow-up Cyan:** follow-up state in the central agenda.

### Tertiary

- **Attention Amber:** warning queue counts, financial attention, and other conditions requiring review.
- **Exception Red:** danger queue counts and service exception state.

### Neutral

- **Graphite Base:** page field.
- **Cabinet Black:** left and right rails.
- **Board Charcoal:** central operational agenda.
- **Header Black:** darkest band inside the metallic header treatment.
- **Metal Border and Gridline:** the panel frame, row rules, and column separators.
- **Ivory Display:** dominant display text; **Queue Text** and **Ledger Muted** step down in priority.

**The State-Only Color Rule.** A colored value must identify a live system state, domain, or severity. Structure stays neutral; do not introduce color fields, colored cards, or decorative gradient surfaces.

## Typography

The operations wall is mono-led. IBM Plex Mono is used for brand, title, clock, headings, rows, timestamps, and ledger outputs to establish a precise tabular cadence. All state labels are uppercase and tracked; use the compact label role for headers and column names.

The brand and page title are large but mechanically restrained. Row data is small and dense, with truncation rather than wrapping in fixed table cells. Montserrat remains available in the wider product shell, but this operational wall should retain its monospaced display language.

## Layout

The header is a three-part band: brand left, title centered, live clock right. The main wall is always-open at desktop: left queues/agents rail, central agenda board, and right event stream. The bottom ledger contains six equal summary cells and completes the first-viewport operational picture.

The central board is a fixed five-column agenda: domain, current state, owner, latest signal, and next step. Rows maintain their columns and their 47px rhythm; event rows similarly hold time, source, and event in a fixed 56px/63px/flexible grid. Do not convert this surface into collapsible accordions or detached metric cards.

At `1200px`, the event stream occupies a full-width lower row while queues and agenda remain paired; the ledger becomes three columns. At `820px`, the wall stacks, the agenda remains horizontally scrollable at a 700px minimum, and the ledger becomes two columns. Keep all queues, agenda, activity stream, and ledger open in every breakpoint.

## Elevation & Depth

This is a flat, framed system. Depth comes from the header’s dark horizontal gradient, inset highlight, and restrained cabinet shadow; the core wall uses surface contrast plus one-pixel gray metal rules. The only recurring interactive lift is the agenda row’s small background shift on hover.

Avoid floating cards, blurred glass, large shadows, and large color glows. The live-dot glow is intentionally local: it confirms connection status without making the whole interface luminous.

## Shapes

The wall is squared and grid-led. Major panels, rails, agenda rows, and ledger cells have no rounded corners; circles are reserved for live and agent availability dots. Maintain crisp one-pixel rules, rectangular cells, and the visual rhythm of hardware panels.

## Components

- **Operations header:** three aligned zones for ARCIL, “Operação agora,” and a monospaced live clock; the blue live dot is paired with `AO VIVO` copy.
- **Queue row:** an uppercase label/count row in the left rail. Severity alters only the count color, preserving the neutral structural field.
- **Agent row:** a small availability dot with a name and one-line operational summary; disabled and enabled state use neutral and green respectively.
- **Agenda board row:** the five-column operational record. Domain is ivory; state and next step receive domain-specific state color; columns stay fixed and truncate overflow.
- **Event stream row:** a three-column time/source/event record. The event type determines a factual green or amber signal when applicable.
- **Footer ledger cell:** a compact label/value cell that makes top-level operational status visible without expanding another panel.

## Do's and Don'ts

**Do:**

- Do keep queues, agent state, agenda, events, and ledger visible in the same operational frame.
- Do preserve the fixed table columns, compact row heights, and monospaced scan rhythm.
- Do use colored values for factual domain, connection, health, and severity state.
- Do expose long mobile agenda data through intentional horizontal scroll rather than removing columns.
- Do pair the live dot and all other color signals with readable text or a count.

**Don't:**

- Don't replace the wall with cards, tabs, accordions, or a feed that hides part of the operation.
- Don't round, soften, or elevate the board into a consumer dashboard aesthetic.
- Don't use gradients beyond the restrained header band or use glow as a general decoration.
- Don't add unverified severity to events; only queue severity and supplied type/state determine their treatment.
- Don't wrap dense board-cell text into tall rows; truncate inside the existing scan grid.
