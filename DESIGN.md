---
name: ARCIL Operations Console
description: A dual-theme operational console where every screen is built from the same card, metric, chip and table primitives.
colors:
  bg-base: "#edf2f5"
  bg-surface: "#f8fafb"
  bg-subtle: "#e3ebef"
  bg-inset: "#eef3f6"
  text-primary: "#142631"
  text-secondary: "#4b626e"
  text-muted: "#667b86"
  border: "#cbd8de"
  border-strong: "#aebfc8"
  signal-blue: "#1f4f86"
  signal-emerald: "#2b8068"
  signal-amber: "#b77b28"
  signal-red: "#b74444"
  signal-violet: "#566fa8"
  signal-sky: "#6895b2"
  sidebar-bg: "#172959"
  sidebar-border: "#263d70"
  sidebar-text: "#d7e4f1"
  sidebar-dim: "#a8bfd4"
  sidebar-active: "#2e5e98"
typography:
  title:
    fontFamily: "Montserrat, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "normal"
  heading:
    fontFamily: "Montserrat, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  body:
    fontFamily: "Montserrat, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  label:
    fontFamily: "Montserrat, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.08em"
  chip:
    fontFamily: "Montserrat, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "normal"
  data:
    fontFamily: "IBM Plex Mono, SF Mono, Fira Code, monospace"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
rounded:
  chip: "4px"
  icon: "6px"
  panel: "8px"
  control: "10px"
  card: "14px"
  pill: "999px"
spacing:
  page: "16px 24px"
  stack: "20px"
  grid: "12px"
  card: "16px"
  row: "10px 12px"
components:
  console-card:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  console-metric:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
    height: "128px"
  console-status:
    backgroundColor: "{colors.bg-subtle}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.chip}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  console-button:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  console-button-active:
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "40px"
  console-input:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "40px"
  console-table-header:
    backgroundColor: "{colors.bg-inset}"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    padding: "8px 12px"
  sidebar-item-active:
    backgroundColor: "{colors.sidebar-active}"
    textColor: "{colors.sidebar-text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
---

# Design System: ARCIL Operations Console

## Overview

**Creative North Star: "The Instrument Panel"**

ARCIL is an operations console, not a reporting dashboard. Every screen answers the same two questions — what is the state right now, and who acts next — using one small vocabulary of parts: a titled page, a row of measured metrics, and panels that are either a table or a list of rows. A team member moving from Leads to Cobranças to Estoque should never have to relearn where to look; the furniture is identical and only the readings change.

The surface is quiet on purpose. Neutral panels carry the structure, and color appears only where it reports something factual: a severity, a domain, a connection state, a stock condition. Numbers are set in a monospaced face with tabular figures so a column of readings lines up and a changing value does not reflow its neighbours. Everything else is Montserrat, the same face as arcil.com.br.

The system is dual-theme by construction. Light and dark are not two skins over one palette; they are two sets of values behind the same variable names, including the accents. The one element that does not flip is the sidebar, which stays deep navy in both themes as the fixed brand anchor of the product.

**Key Characteristics:**

- One page shell — title, subtitle, actions, then stacked sections — reused by every route.
- Cards are gently rounded (14px), hairline-bordered and softly shadowed; they never nest.
- Numerals live in IBM Plex Mono with tabular figures; prose and labels live in Montserrat.
- Accent colour is state reporting, never decoration, and always read from a theme variable.
- The navy sidebar is theme-independent and frames every screen.

## Colors

A cool blue-grey field in both themes, with six muted signal accents that carry all the meaning.

### Primary

- **Signal Blue** — the default accent: primary and active controls, focus outlines, links, progress fill, and the "informational" severity in queues and chips.

### Secondary

- **Signal Emerald** — healthy or completed state: enabled agents, positive metric helper lines, synced stock, answered follow-ups.
- **Signal Amber** — factual attention that has not yet failed: overdue queues, urgent follow-ups, billing awaiting a decision.

### Tertiary

- **Signal Red** — real exception: danger-severity queues, error surfaces, destructive controls.
- **Signal Violet** — the AI-automation domain: agent state and agent-related metrics.
- **Signal Sky** — a supporting cool accent for secondary data emphasis.

### Neutral

- **Base** — the page field behind all panels.
- **Surface** — the panel and card fill that sits above the base.
- **Subtle** — chip fills, empty progress tracks, and the hover fill on sidebar items.
- **Inset** — table headers, input fills, and row hover inside panels.
- **Text Primary / Secondary / Muted** — a three-step text ramp; muted is the floor, never the body colour.
- **Border / Border Strong** — the hairline rules that separate rows, panels and table headers.

### The Sidebar Palette

**Sidebar BG / Border / Text / Dim / Active** are declared identically in both themes. They are a brand surface, not a content surface, and they do not participate in the light/dark swap.

### Named Rules

**The Theme-Variable Rule.** Accent text must be set from `var(--blue)`, `var(--emerald)`, `var(--amber)`, `var(--red)`, `var(--violet)` or `var(--sky)`, never from a fixed Tailwind shade. The theme swaps those variables; a literal `text-blue-300` survives the swap and lands at roughly 1.9:1 on the light field. Tinted backgrounds and borders may stay as `blue-500/10` and `blue-500/25`, because a 10% tint reads correctly over either field.

**The State-Only Colour Rule.** A coloured value identifies a state, a severity or a domain. Structure — panels, rules, headers, page chrome — stays neutral. No colour fields, no gradient surfaces, no accent used because a section needed variety.

## Typography

**UI Font:** Montserrat (with the system sans stack as fallback)
**Data Font:** IBM Plex Mono (with SF Mono / Fira Code as fallback), applied through the `.font-data` class

**Character:** Montserrat is geometric and slightly wide, which keeps small bold labels legible at 10–11px where a humanist face would blur. IBM Plex Mono carries the readings, with `font-variant-numeric: tabular-nums` and −0.02em tracking so digits align in a column and a value updating in place never shifts the layout around it.

### Hierarchy

- **Title** (700, 22px, tight leading): the page name in the console header. One per screen.
- **Heading** (700, 13px): panel and card headings.
- **Body** (500, 12px): row content, table cells, descriptive text.
- **Label** (700, 11px, 0.08em, uppercase): metric labels and table column headers.
- **Chip** (700, 10px, uppercase): status chip text.
- **Data** (700, 30px, mono): the metric readings. Smaller mono runs at 11–16px for timestamps, counts and inline figures.

### Named Rules

**The Mono-for-Measurement Rule.** `.font-data` goes on numbers, currency, timestamps and identifiers. It never goes on prose, labels or headings — monospace here is for alignment, not for flavour.

## Layout

The shell is a fixed navy sidebar plus a scrolling content column. The sidebar is 64px collapsed and 244px open (`--sidebar-w-closed` / `--sidebar-w-open`); the content column owns its own vertical scroll so the sidebar never moves.

Inside the content column, `ConsolePage` sets the rhythm: 24px horizontal and 16px vertical padding, a header separated by a hairline rule, then sections stacked with a 20px gap. Sections are CSS grids with a 12px gutter that collapse to a single column on small screens — metric rows run `1 → 2 → 3` columns across `md` and `xl`, and split panel rows run `1 → 3` columns at `xl`, with the wider panel spanning two.

Density is deliberate. Panel rows are ~10px vertical padding, table cells the same, and lists separate with hairline dividers rather than gaps. Wide tables scroll horizontally inside their own container so the page body never does.

## Elevation & Depth

Layered but shallow. Cards sit on the base field via a two-part shadow — a 1px contact shadow plus a wide soft ambient — and are additionally outlined by a hairline border, so they stay legible in light mode where shadow alone would disappear. Inside a card, depth comes from tonal steps (inset for headers and inputs, subtle for chips) rather than from more shadow.

### Shadow Vocabulary

- **Card** (`0 1px 2px rgba(20,38,49,0.08), 0 8px 24px rgba(20,38,49,0.06)` in light; black-based equivalents in dark): every panel and metric tile.
- **Extra small → Extra large** (`--shadow-xs` … `--shadow-xl`): a five-step ramp for drawers, dialogs and popovers.

### Named Rules

**The No-Nesting Rule.** A card never contains another card. Sub-sections inside a panel are separated by a hairline divider or a tonal step, never by a second bordered, shadowed box.

## Shapes

Softly squared. The radius ladder runs 4px for chips, 6px for metric icon tiles, 8px for small panels, 10px for buttons and sidebar items, and 14px for cards. Two shapes break the ladder on purpose: inputs are full pills (999px) so a search field is unmistakable next to a rectangular button, and status dots are circles.

Borders are always 1px. Separation inside a panel is a 1px divider in the border colour; a card is a 1px outline plus its shadow. Keyboard focus is a 2px Signal Blue outline offset 2px, applied globally through `:focus-visible`.

## Components

### Buttons

- **Shape:** 10px radius, 40px tall, 16px horizontal padding.
- **Default:** surface fill, 1px border, secondary text, 12px bold; hover raises the border to 50% Signal Blue and the text to primary.
- **Active / selected:** solid Signal Blue fill with white text — used for the selected tab in a button-group.
- **Icon:** an optional 14px Lucide glyph sits before the label with an 8px gap.

### Status chips

- **Style:** 4px radius, 10px bold uppercase, 2px/8px padding, a 10% accent tint fill and a 25% accent border, with the text read from the matching theme variable.
- **Tones:** blue, emerald, amber, red, violet and a neutral slate that uses the subtle fill and secondary text.
- **Use:** one factual word or number — a state, a severity count, a domain. Never a sentence.

### Cards and panels

- **Corner:** 14px. **Background:** surface. **Border:** 1px hairline. **Shadow:** the card shadow.
- **Padded** (default, 16px) for prose and free-form content; **unpadded** when the card holds a table or a divided row list, in which case the heading gets its own 16px/12px block closed by a hairline rule.

### Metric tiles

- **Shape:** a card, minimum 128px tall.
- **Composition:** an uppercase 11px label, a 30px monospaced reading, and an optional emerald helper line, with a 32px tinted icon tile (6px radius) in the top-right corner carrying the tone.
- **Use:** one reading per tile. A tile that needs two numbers is two tiles.

### Inputs

- **Style:** pill (999px), 40px tall, inset fill, 1px border, 13px text, muted placeholder.
- **Focus:** the border shifts to 60% Signal Blue; the global focus ring applies on keyboard focus.

### Tables

- **Header:** inset fill, 10px bold uppercase tracked labels in muted text, closed by a hairline rule.
- **Body:** 12px cells with ~10px vertical padding, hairline row dividers, inset fill on row hover.
- **Overflow:** the table lives in its own horizontally scrolling container.

### Navigation

- **Style:** the navy sidebar, 13px semibold items with a 17px Lucide icon and a 12px gap, 10px radius.
- **States:** rest is sidebar text on the navy field; hover is a 6% white wash; active is the Sidebar Active fill.
- **Mobile:** the rail collapses behind a menu button; the theme toggle, user block and logout stay pinned to the bottom.

### Feedback states

- **Loading:** a centred spinner inside a 160px-tall card, in place of the content it replaces.
- **Error:** a card with a 30% red border, a 5% red wash, a warning glyph and the message.
- **Empty:** centred 12px muted text inside the panel that would have held the rows, saying what would appear there.

## Do's and Don'ts

### Do:

- **Do** build new screens from `ConsolePage`, `ConsoleCard`, `ConsoleMetric`, `ConsoleStatus`, `ConsoleTable`, `ConsoleButton` and `ConsoleInput` rather than hand-rolling a layout.
- **Do** read every colour from a theme variable, and verify both themes before calling a screen done.
- **Do** put numerals in `.font-data` so columns align and live values do not reflow.
- **Do** give every list and table an empty state that names what belongs there.
- **Do** let wide tables scroll inside their own container.

### Don't:

- **Don't** use a fixed Tailwind colour for accent text; the theme swap will strand it at unreadable contrast.
- **Don't** nest a card inside a card.
- **Don't** use monospace for prose, labels or headings.
- **Don't** introduce a per-page visual language — a route with its own CSS module and its own header is a defect, not a feature.
- **Don't** colour a surface for variety; colour reports state.
- **Don't** rely on the `dark:` Tailwind variant for anything the CSS variables already express; theming here runs through `:root` / `.dark` variable declarations.
