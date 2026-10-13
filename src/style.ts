// Tokens come from the QACK DESIGN note. The --color-health-*, --color-warn and --color-row-* tokens are the only ones defined here.
export const STYLE = `
:root {
  --color-brand-primary: #2dd4bf;
  --color-brand-secondary: #5eead4;
  --color-brand-tint: rgb(45 212 191 / 5%);
  --color-brand-border: rgb(45 212 191 / 30%);
  --color-focus-ring: rgb(45 212 191 / 50%);
  --color-canvas: #09101a;
  --color-canvas-gradient-end: #151b2c;
  --color-surface-card-top: rgb(18 29 46 / 82%);
  --color-surface-card-bottom: rgb(14 23 39 / 78%);
  --color-text-primary: #f8fafc;
  --color-text-heading: #ffffff;
  --color-text-muted: #a1a1aa;
  --color-border-subtle: rgb(255 255 255 / 5%);
  --color-border-card: rgb(39 39 42 / 90%);
  --color-error: #f87171;
  --color-form-error: #f43f5e;
  --color-health-none: #918a8f;
  --color-health-track: rgb(255 255 255 / 9%);
  --color-warn: #fbbf24;
  --status-passed-text: #3fb950;
  --status-passed-bg: rgb(63 185 80 / 10%);
  --status-passed-border: rgb(63 185 80 / 35%);
  --status-failed-text: #f85149;
  --status-failed-bg: rgb(248 81 73 / 10%);
  --status-failed-border: rgb(248 81 73 / 40%);
  --status-flaky-text: #d29922;
  --status-flaky-bg: rgb(210 153 34 / 10%);
  --status-flaky-border: rgb(210 153 34 / 40%);
  --status-skipped-text: #918a8f;
  --status-skipped-bg: rgb(145 138 143 / 10%);
  --status-skipped-border: rgb(145 138 143 / 30%);
  --status-executed-text: #f8fafc;
  --status-executed-bg: rgb(255 255 255 / 5%);
  --status-executed-border: rgb(255 255 255 / 14%);
  --color-row-module: #0d1626;
  --color-row-repo: #111c2f;
  --color-row-product: #12263a;
  --color-row-hover: #17233a;
  --color-guide: rgb(255 255 255 / 9%);
  --radius-card: 0.75rem;
  --radius-pill: 9999px;
  --container-main: 80rem;
}
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  padding: 3rem 1.5rem 4rem;
  background: linear-gradient(to bottom, var(--color-canvas), var(--color-canvas-gradient-end)) fixed;
  color: var(--color-text-primary);
  font: 400 0.875rem/1.25rem ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: var(--container-main); margin: 0 auto; }
header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 0.5rem 2rem; margin-bottom: 1.5rem; }
h1 { margin: 0; color: var(--color-text-heading); font-size: 2.25rem; line-height: 2.5rem; font-weight: 700; letter-spacing: -0.035em; }
.lede { margin: 0.375rem 0 0; max-width: 36rem; color: var(--color-text-muted); }
.generated { margin: 0; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.card {
  overflow: hidden;
  border: 1px solid var(--color-border-card);
  border-radius: var(--radius-card);
  background: var(--color-row-module);
  box-shadow: 0 1px 0 rgb(255 255 255 / 4%) inset, 0 24px 48px -24px rgb(0 0 0 / 55%);
}
table { width: 100%; table-layout: auto; border-collapse: separate; border-spacing: 0; }
th { padding: 0.75rem 0.875rem; border-bottom: 1px solid var(--color-border-card); background: var(--color-row-module); color: var(--color-text-muted); font-size: 0.75rem; font-weight: 500; text-align: left; }
td { padding: 0.5rem 0.875rem; border-top: 1px solid var(--color-border-subtle); background: var(--row-bg); overflow-wrap: anywhere; }
thead + tbody tr:first-child td { border-top: 0; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.bad { color: var(--color-error); font-weight: 600; }
tr {
  --tealShare: clamp(0, (var(--pass) - var(--rose-at)) / (1 - var(--rose-at)), 1);
  --health: color-mix(in oklch, var(--color-brand-primary) calc(var(--tealShare) * 100%), var(--color-form-error));
  --row-bg: var(--color-row-module);
}
tr.no-rate { --health: var(--color-health-none); }
tr.run-failed { --health: var(--color-form-error); }
tr.module:hover { --row-bg: var(--color-row-hover); }
.failed-text { color: var(--color-error); font-weight: 600; }
th.name, td.name { position: relative; min-width: 10rem; }
tr.product { --row-bg: var(--color-row-product); }
tr.product td.name { padding-left: 2.25rem; }
tr.product td { padding-top: 0.875rem; padding-bottom: 0.875rem; border-top: 1px solid var(--color-brand-border); color: var(--color-text-heading); font-size: 1rem; font-weight: 700; }
tr.repo { --row-bg: var(--color-row-repo); }
tr.repo td { font-weight: 600; }
tr.repo td.name { padding-left: 2.875rem; }
tr.module td.name { padding-left: 3.875rem; }
tr.repo td.name, tr.module td.name { background-repeat: no-repeat; background-size: 1px 100%; }
tr.repo td.name { background-image: linear-gradient(var(--color-guide), var(--color-guide)); background-position: 0.875rem 0; }
tr.module td.name { background-image: linear-gradient(var(--color-guide), var(--color-guide)), linear-gradient(var(--color-guide), var(--color-guide)); background-position: 0.875rem 0, 2.1875rem 0; }
.fold { appearance: none; -webkit-appearance: none; position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
tr.product td.name::before, tr.repo td.name::before { content: ""; position: absolute; top: 50%; width: 0.875rem; height: 0.875rem; background: var(--color-text-muted); clip-path: polygon(30% 20%, 80% 50%, 30% 80%); transform: translateY(-50%) rotate(90deg); pointer-events: none; }
tr.product td.name::before { left: 0.875rem; }
tr.repo td.name::before { left: 1.6875rem; }
td.name:has(.fold:checked)::before { transform: translateY(-50%); }
td.name:has(.fold):hover { --row-bg: var(--color-row-hover); }
td.name:has(.fold):hover::before { background: var(--color-text-heading); }
td.name:has(.fold:focus-visible) { box-shadow: inset 0 0 0 2px var(--color-focus-ring); }
.sub { margin-left: 0.5rem; color: var(--color-text-muted); font-size: 0.75rem; font-weight: 400; }
.reason { color: var(--color-text-muted); }
td:has(> .sub) { white-space: nowrap; }
.health { font-variant-numeric: tabular-nums; white-space: nowrap; }
.swatch { position: relative; display: inline-block; width: 4rem; height: 0.375rem; margin-right: 0.75rem; border-radius: var(--radius-pill); background: var(--color-health-track); vertical-align: 0.1875rem; }
.swatch::after { content: ""; position: absolute; inset: 0 auto 0 0; width: calc(var(--pass, 0) * 100%); border-radius: inherit; background: var(--health); animation: fill 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
.swatch::before { content: ""; position: absolute; top: -0.1875rem; bottom: -0.1875rem; left: calc(var(--rose-at) * 100%); z-index: 1; width: 1px; background: rgb(255 255 255 / 45%); }
tr.module.run-failed .swatch::after { width: 100%; }
tr.no-rate .swatch::before, tr.run-failed .swatch::before { display: none; }
@keyframes fill { from { width: 0; } }
.badge { margin-left: 0.5rem; padding: 0.125rem 0.625rem; border: 1px solid color-mix(in srgb, var(--color-warn) 40%, transparent); border-radius: var(--radius-pill); background: color-mix(in srgb, var(--color-warn) 10%, transparent); color: var(--color-warn); font-size: 0.6875rem; font-weight: 600; }
tr.run-failed .badge { border-color: color-mix(in srgb, var(--color-form-error) 45%, transparent); background: color-mix(in srgb, var(--color-form-error) 12%, transparent); color: var(--color-error); }
a { color: var(--color-brand-secondary); text-decoration: underline; text-decoration-color: var(--color-brand-border); text-underline-offset: 0.25em; }
a:hover { text-decoration-color: currentColor; }
a:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; border-radius: 0.25rem; }
.counters { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 1rem; padding: 0; list-style: none; }
.counter { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.875rem; border: 1px solid var(--chip-border); border-radius: var(--radius-pill); background: var(--chip-bg); color: var(--chip-text); font-variant-numeric: tabular-nums; }
.counter .count { font-size: 1rem; font-weight: 700; }
.counter .label { color: var(--color-text-muted); }
.counter .pct { padding-left: 0.5rem; border-left: 1px solid var(--chip-border); font-size: 0.75rem; font-weight: 600; }
.counter.executed { --chip-bg: var(--status-executed-bg); --chip-border: var(--status-executed-border); --chip-text: var(--status-executed-text); }
.counter.passed { --chip-bg: var(--status-passed-bg); --chip-border: var(--status-passed-border); --chip-text: var(--status-passed-text); }
.counter.failed { --chip-bg: var(--status-failed-bg); --chip-border: var(--status-failed-border); --chip-text: var(--status-failed-text); }
.counter.flaky { --chip-bg: var(--status-flaky-bg); --chip-border: var(--status-flaky-border); --chip-text: var(--status-flaky-text); }
.counter.skipped { --chip-bg: var(--status-skipped-bg); --chip-border: var(--status-skipped-border); --chip-text: var(--status-skipped-text); }
.counter.zero { --chip-bg: transparent; --chip-border: var(--color-border-subtle); --chip-text: var(--color-text-muted); }
.counter.zero .count { font-weight: 500; }
.legend { margin: 1rem 0 0; color: var(--color-text-muted); font-size: 0.75rem; line-height: 1.125rem; }
.spark { vertical-align: middle; }
.spark path { fill: none; stroke: var(--health); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.spark circle { fill: var(--health); }
.trends { margin: 0 0 1.5rem; }
.trends h2 { margin: 0 0 0.75rem; color: var(--color-text-heading); font-size: 1rem; font-weight: 600; }
.trend-group { margin: 0 0 1.25rem; }
.trend-group h3 { margin: 0 0 0.5rem; color: var(--color-text-heading); font-size: 0.875rem; font-weight: 700; }
.trend-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 0.75rem; }
.trend-card {
  --tealShare: clamp(0, (var(--pass, 0) - var(--rose-at)) / (1 - var(--rose-at)), 1);
  --health: color-mix(in oklch, var(--color-brand-primary) calc(var(--tealShare) * 100%), var(--color-form-error));
  min-width: 0; padding: 0.875rem 1rem; border: 1px solid var(--color-border-card); border-radius: var(--radius-card); background: var(--color-row-repo); box-shadow: 0 1px 0 rgb(255 255 255 / 4%) inset, 0 24px 48px -24px rgb(0 0 0 / 55%);
}
.trend-card.overview { border-color: var(--color-brand-border); background: var(--color-row-product); }
.trend-card:not([style]) { --health: var(--color-health-none); }
.trend-card h4 { margin: 0; overflow: hidden; color: var(--color-text-heading); font-size: 0.875rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.hero { display: flex; align-items: baseline; gap: 0.625rem; margin: 0.25rem 0 0.5rem; }
.hero .rate { color: var(--color-text-heading); font-size: 1.5rem; line-height: 2rem; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.trend-card > .spark { display: block; width: 100%; height: auto; }
.delta { color: var(--color-text-muted); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.worse .delta { color: var(--color-error); font-weight: 600; }
.better .delta { color: var(--status-passed-text); font-weight: 600; }
@media (max-width: 40rem) {
  body { padding: 2rem 1rem 3rem; }
  h1 { font-size: 1.875rem; line-height: 2.25rem; }
  th, td { padding-left: 0.5rem; padding-right: 0.5rem; }
  th.name, td.name { min-width: 8rem; }
}
@media (prefers-reduced-motion: reduce) {
  .swatch::after { animation: none; }
}
`;
