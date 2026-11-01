---
name: qack-pulse
description: A dark dashboard for scanning test automation health.
colors:
  brand-primary: "#2dd4bf"
  brand-secondary: "#5eead4"
  canvas: "#09101a"
  canvas-gradient-end: "#151b2c"
  text-primary: "#f8fafc"
  text-heading: "#ffffff"
  text-muted: "#a1a1aa"
  border-card: "rgb(39 39 42 / 90%)"
  brand-border: "rgb(45 212 191 / 30%)"
  focus-ring: "rgb(45 212 191 / 50%)"
  error: "#f87171"
  health-low: "#f43f5e"
  health-none: "#918a8f"
  warning: "#fbbf24"
  passed: "#3fb950"
  failed: "#f85149"
  flaky: "#d29922"
  module-surface: "#0d1626"
  repo-surface: "#111c2f"
  product-surface: "#12263a"
  row-hover: "#17233a"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  display:
    fontSize: "2.125rem"
    fontWeight: 800
    lineHeight: "2.5rem"
    letterSpacing: "-0.02em"
  title:
    fontSize: "1rem"
    fontWeight: 600
  label:
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  card: "0.75rem"
  pill: "9999px"
  calendar-day: "0.375rem"
spacing:
  small: "0.5rem"
  medium: "1rem"
  large: "1.5rem"
components:
  trend-card:
    backgroundColor: "{colors.repo-surface}"
    rounded: "{rounded.card}"
    padding: "0.875rem 1rem"
  history-picker:
    backgroundColor: "{colors.module-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 0.75rem"
---

# Design System: qack-pulse

## Overview

**Creative North Star: "The Health Console"**

A compact, dark operational dashboard makes test health easy to scan across a hierarchy. Teal accents, restrained surface changes, and clear numeric labels keep attention on the results.

**Key Characteristics:**
- Dense, structured tables with visible product, repository, and module levels.
- Semantic health colors accompanied by numbers or labels.
- Dark layered surfaces, rounded containers, and subtle depth.

## Colors

Teal identifies the product and links; status colors communicate test outcomes. Use muted text for supporting information and white for headings. The frontmatter records the implemented palette.

**The Health Scale Rule.** Pass-rate bars, sparklines, and calendar days share a teal-to-rose scale; missing rates use neutral gray, and failed runs receive a distinct failure treatment.

Status counters use green for passed, red for failed, amber for flaky, and gray for skipped. Their tinted backgrounds and borders are specified in `src/style.ts`. A zero counter becomes quiet and drops its icon.

## Typography

Use the system sans-serif stack throughout. The main title is heavy and tightly tracked; section titles and row groups use weight to establish hierarchy. Body copy is compact, and supporting labels are smaller and muted. Numeric counts, dates, rates, and deltas use tabular figures to aid comparison.

## Layout

Center content in a container capped at 80rem. Desktop page padding is 3rem 1.5rem 4rem; at 40rem and below it becomes 2rem 1rem 3rem. Trend cards form an auto-filling grid with a 17rem preferred minimum and 0.75rem gaps. Tables scroll horizontally when needed; on narrow screens the name column stays sticky. The calendar uses seven equal columns and scrolls on very narrow screens.

## Elevation & Depth

Depth comes from the dark canvas gradient, progressively lighter hierarchy surfaces, subtle borders, and a soft card shadow (`0 1px 0 rgb(255 255 255 / 4%) inset, 0 24px 48px -24px rgb(0 0 0 / 55%)`). The logo has a separate teal glow. Surface contrast and row indentation carry hierarchy more than shadow.

## Shapes

Cards have softly rounded corners; counters, badges, and navigation choices use pills. Calendar days use smaller rounded corners. Borders are restrained, with a teal border identifying product-level emphasis and selected month controls.

## Components

### Hierarchical results table

Product, repository, and module rows use distinct surface tones and indentation, with fine vertical guides. Product and repository names toggle their children. Module rows highlight on hover; keyboard focus receives an inset teal ring. Align numeric cells to the right and keep counts readable alongside health bars.

### Status counters and badges

Pill counters pair labels and counts with status-tinted borders and backgrounds. Warning and failed-run badges use the same compact pill language. Text accompanies color.

### Trend cards

Cards show a name, prominent current rate, delta, and sparkline. Product overview cards use the product surface and teal border. Daily values remain available in an expandable details element. Health lines use the same scale as the table.

### History navigation and calendar

Job links and month selectors are rounded pills with generous 2.75rem minimum hit height. The selected month has a teal border and product surface. Calendar days show a date and rate; days with runs use a translucent health tint, while future days are subdued. An expandable list supplies run details.

### Links and focus

Teal links use a subtle underline that becomes stronger on hover. Visible keyboard focus uses a teal outline. Health bar fill animates for 700ms; reduced-motion preferences disable it.

## Do's and Don'ts

### Do:
- **Do** pair health colors with numeric rates or descriptive labels.
- **Do** retain distinct surfaces and indentation for the hierarchy.
- **Do** preserve visible keyboard focus and reduced-motion behavior.

### Don't:
- **Don't** represent missing rates as zero or as a successful result.
- **Don't** rely on color alone to communicate test status.
