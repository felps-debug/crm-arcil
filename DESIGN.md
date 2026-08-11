---
name: ARCIL Broadcast Operations System
description: Live operational CRM for reading company state, exceptions, and next actions at a glance.
colors:
  ink-base: "#071321"
  lane-surface: "#0b1d2f"
  rail-inset: "#091827"
  hover-surface: "#102842"
  porcelain-data: "#f0f5fb"
  operational-muted: "#91a7bc"
  structural-border: "#203c56"
  broadcast-blue: "#5b9cf3"
  signal-green: "#62c779"
  attention-amber: "#efb332"
  exception-red: "#ed7a68"
  automation-violet: "#b58aff"
  service-cyan: "#46cddd"
typography:
  display:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "clamp(28px, 3vw, 44px)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.045em"
  title:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: "Montserrat, sans-serif"
    fontSize: "11px"
    fontWeight: 800
    letterSpacing: "0.08em"
  data:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "clamp(22px, 2vw, 31px)"
    fontWeight: 800
    letterSpacing: "-0.06em"
rounded:
  micro: "5px"
  compact: "6px"
  control: "8px"
  strip: "10px"
  panel: "12px"
spacing:
  lane-gap: "8px"
  compact: "12px"
  panel: "16px"
  attention: "18px"
  page: "clamp(20px, 2.8vw, 42px)"
components:
  button-primary:
    backgroundColor: "{colors.broadcast-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.panel}"
    padding: "8px 16px"
  lane:
    backgroundColor: "{colors.lane-surface}"
    textColor: "{colors.porcelain-data}"
    rounded: "{rounded.panel}"
    height: "92px"
  attention-critical:
    backgroundColor: "#3d2a0b"
    textColor: "{colors.porcelain-data}"
    rounded: "{rounded.panel}"
    padding: "14px 18px"
  activity-rail:
    backgroundColor: "{colors.rail-inset}"
    textColor: "{colors.porcelain-data}"
    rounded: "{rounded.panel}"
  live-badge:
    backgroundColor: "#143861"
    textColor: "#eff6ff"
    rounded: "{rounded.compact}"
    padding: "8px 11px"
---

# Design System: ARCIL Broadcast Operations System

## Overview

**Creative North Star: "The Live Operations Rundown"**

ARCIL is a dense, dark operational console whose visual hierarchy works at close range and on an owner’s TV. The baseline is ink-blue and porcelain rather than neutral dashboard gray: it reads as an active control desk, with precise data and clear destinations instead of a generic card grid.

The system treats every domain as a live line in a broadcast rundown. A domain’s state, trend, and next destination are visible in one horizontal scan; a single attention ribbon owns the exception state. This keeps normal information calm while making a real issue unmistakable.

**Key Characteristics:**

- Ink-blue tonal layering, separated by restrained blue structural borders.
- Montserrat carries labels and decisions; IBM Plex Mono carries quantities, timestamps, and live data.
- Color identifies a domain or an active state; it never carries the meaning alone.
- Compact, flat panels and horizontal lanes favor scanning over decoration.

## Colors

The palette is a broadcast desk: dark enough to recede, bright enough for real-time data, and deliberately sparing with attention colors.

### Primary

- **Broadcast Blue:** primary navigation, live state, links, and the default operational signal.
- **Signal Green:** successful or healthy live signals.
- **Automation Violet:** AI/agent domain identification.
- **Service Cyan:** follow-up and service-domain identification.

### Tertiary

- **Attention Amber:** an active operational condition, count, or warning; reserve it for something that warrants attention.
- **Exception Red:** failure, danger, or a human-required exception.

### Neutral

- **Ink Base:** the page field and darkest layer.
- **Lane Surface:** the main operational row surface.
- **Rail Inset:** quieter, nested panels such as the activity rail and rundown strip.
- **Porcelain Data:** highest-priority text and numerical output.
- **Operational Muted:** supporting copy, timestamps, and empty states.
- **Structural Border:** low-contrast panel separation and dividers.

**The Reserved Attention Rule.** Amber and red communicate an active state that needs recognition; do not use them for decoration, arbitrary categories, or a routine primary action.

## Typography

Montserrat is the interface voice: heavy, tightly tracked headings establish the console’s broadcast cadence, while compact uppercase labels make state groups scannable. Keep supporting text concise and readable rather than turning the dashboard into a wall of annotations.

IBM Plex Mono is for operational evidence: lane metrics, time, counts, values, and state changes. Use tabular numerals where values need comparison. Large metrics use the data role; they are visual anchors, not headings.

## Layout

The page has responsive outer padding and begins with a masthead, live metadata, then an attention ribbon. The primary stage is a two-column grid: a flexible list of six horizontal operational lanes with a narrower activity rail. The rundown ticker sits below as an always-visible horizontal chronology.

Each desktop lane has five scan zones: icon, domain name/detail, metric/change, trend bars, and next destination. At `1180px`, the rail moves below and the next-destination zone drops; at `760px`, lanes reduce to icon, name, and metric while trend and next-destination information are removed. Do not hide the current metric, domain name, or attention state on narrow screens.

The persistent application shell leaves room for the fixed desktop sidebar; mobile uses a top bar and drawer. Maintain the dense horizontal reading pattern where space permits rather than reverting the dashboard to a tile grid.

## Elevation & Depth

Depth is primarily tonal, not floaty. Page, lane, rail, and hover states use progressively lighter ink-blue surfaces with a one-pixel structural border. The broadcast dashboard’s card shadow is a controlled low-contrast lift; it should not make ordinary data modules appear elevated above the operation.

The active sidebar item and primary action may use a blue glow. This is a state cue, not ambient decoration. Hovering an operational lane shifts it 4px right and lightens its surface; the motion reinforces that a row is a destination.

## Shapes

Corners are compact and functional: 12px for panels and lanes, 10px for the rundown strip, 8px for icon wells and controls, and 5–6px for dense status elements. Borders are thin and cool-toned. Avoid oversized rounding, pill-shaped panels, or soft skeuomorphic surfaces.

## Components

- **Live badge:** compact uppercase status label with a green dot, used beside freshness metadata.
- **Attention ribbon:** full-width three-zone signal with icon, decisive copy, and a clear operational link. It has a clear-state variant; alert color appears only when the actual state warrants it.
- **Operational lane:** a 92px linked row that binds a domain accent, metric, supporting detail, microtrend, and next destination. Its six tone variants correspond to operational domains, not arbitrary decoration.
- **Activity rail:** quiet inset panel with a counted header, timestamped events, small type markers, and truncation for long labels.
- **Rundown ticker:** low-height strip for the most recent cross-system events; horizontal overflow is intentional.
- **Navigation:** persistent dark rail with a bright active item and compact icons; the navigation surface stays visually subordinate to the live dashboard.
- **Buttons and badges:** use the shared rounded control language, clear text contrast, visible keyboard focus, and compact operational sizing.

## Do's and Don'ts

**Do:**

- Do lead every operational surface with the state that changes a person’s next action.
- Do pair a color signal with copy, an icon, a metric, or another non-color cue.
- Do use the mono face for values that users compare across rows or over time.
- Do preserve visible focus treatment and the reduced-motion behavior defined globally.
- Do favor dense rows, dividers, and meaningful labels over decorative charts or illustrations.

**Don't:**

- Don't replace the dark rundown system with a pastel dashboard or a generic grid of floating cards.
- Don't make amber, red, or glow a normal decorative accent.
- Don't hide the only metric or only exception indicator behind hover, tooltip, or interaction.
- Don't use large soft shadows, oversized pills, or gradients as a substitute for operational hierarchy.
- Don't invent severity for activity events when the data contract only provides event type and time.
