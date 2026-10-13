import type { NoDataReason, RunFailedDetail } from './collect.ts';
import type { Dashboard, ModuleRow, Summary } from './rollup.ts';
import { historyId } from './history-page.ts';
import { ICONS } from './icons.ts';
import type { Counts } from './stats.ts';
import { STYLE } from './style.ts';
import type { DashboardTrend } from './trend.ts';
import { trendCards } from './trend-cards.ts';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const REASONS: Record<NoDataReason, string> = {
  'no-run': 'no finished run on the branch',
  'artifact-expired': 'the artifact has expired',
  'artifact-missing': 'the run has no artifact for this module',
  'stats-missing': 'the report has no stats',
  'fetch-failed': 'the GitHub request failed',
};

const DETAILS: Record<RunFailedDetail, string> = {
  'artifact-missing': 'the run has no artifact for this module',
  'stats-missing': 'the report has no stats',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

// Shown in Thai time. A fixed offset is enough because it has no daylight saving.
const UTC_PLUS_7_MS = 7 * 3600 * 1000;

const formatDate = (iso: string | null): string =>
  iso === null || Number.isNaN(Date.parse(iso))
    ? ''
    : `${new Date(Date.parse(iso) + UTC_PLUS_7_MS).toISOString().slice(0, 16).replace('T', ' ')}`;

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '';
  const seconds = Math.round(ms / 1000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${pad(Math.floor((seconds % 3600) / 60))}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${pad(seconds % 60)}s`;
  return `${seconds}s`;
};

const percent = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

const DASH = '\u2014';

const ageText = (iso: string | null, now: string): string => {
  if (iso === null || Number.isNaN(Date.parse(iso))) return '';
  const days = Math.floor((Date.parse(now) - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : `${days}d ago`;
};

const lastRun = (iso: string | null, stale: boolean, now: string): string => {
  if (iso === null) return '';
  const badge = stale ? ' <span class="badge">stale</span>' : '';
  return `${formatDate(iso)} <span class="sub">${ageText(iso, now)}</span>${badge}`;
};

// Only GitHub https links become anchors. Anything else is dropped.
export const safeUrl = (url: string | null): string | null => (url !== null && /^https:\/\/github\.com\//.test(url) ? url : null);

const runLink = (url: string | null): string => {
  const href = safeUrl(url);
  return href === null ? '' : `<a href="${escapeHtml(href)}">run</a>`;
};

// With a trend the cell points at the module's card on the history page, which carries the run link.
// Without one there is no history page, so the cell keeps the plain run link.
const historyCell = (url: string | null, id: string | null): string =>
  `<td class="history">${id === null ? runLink(url) : `<a href="history.html#${id}">history</a>`}</td>`;

// The row carries only the pass rate. CSS turns it into the health color.
// A failed run overrides the scale because its counts are unknown.
const rowOpen = (kind: string, passRate: number | null, failed = false): string => {
  const state = failed ? ' run-failed' : passRate === null ? ' no-rate' : '';
  return passRate === null ? `<tr class="${kind}${state}">` : `<tr class="${kind}${state}" style="--pass:${Number(passRate.toFixed(4))}">`;
};

const healthCells = (passRate: number | null): string =>
  `<td class="health"><span class="swatch"></span>${passRate === null ? DASH : percent(passRate)}</td>`;

const countCells = (counts: Counts): string =>
  [counts.total, counts.passed, counts.failed, counts.skipped, counts.flaky]
    .map((count, index) => `<td class="num${index === 2 && count > 0 ? ' bad' : ''}">${count}</td>`)
    .join('');

const dashCells = Array(5).fill(`<td class="num">${DASH}</td>`).join('');

const fold = (id: string, name: string): string => `<input type="checkbox" class="fold" id="fold-${id}" aria-label="Collapse ${escapeHtml(name)}">`;

const summaryRow = (kind: string, name: string, summary: Summary, id: string): string => {
  const failed = summary.modulesFailed > 0 ? ` <span class="badge">${summary.modulesFailed} ${summary.modulesFailed === 1 ? 'module' : 'modules'} failed</span>` : '';
  const counts = summary.modulesReporting === 0 ? dashCells : countCells(summary.counts);
  const rate = summary.modulesReporting === 0 ? null : summary.passRate;
  return `${rowOpen(kind, rate, summary.modulesFailed > 0)}<td class="name">${escapeHtml(name)} <span class="sub">${summary.modulesReporting} of ${summary.modulesTotal} modules</span>${failed}${fold(id, name)}</td>${healthCells(rate)}${counts}<td></td><td></td><td></td></tr>`;
};

function moduleRow(mod: ModuleRow, now: string, historyId: string | null): string {
  const name = `<td class="name">${escapeHtml(mod.name)}`;
  if (mod.status === 'no-data') {
    return `${rowOpen('module no-data', null)}${name}</td>${healthCells(null)}<td colspan="5" class="reason">No data: ${REASONS[mod.reason]}</td><td></td><td>${lastRun(mod.runDate, mod.stale, now)}</td>${historyCell(mod.runUrl, historyId)}</tr>`;
  }
  if (mod.status === 'run-failed') {
    return `${rowOpen('module', null, true)}${name}</td>${healthCells(null)}<td colspan="5" class="failed-text">Run failed, no results <span class="sub">(${DETAILS[mod.reason]})</span></td><td></td><td>${lastRun(mod.runDate, mod.stale, now)}</td>${historyCell(mod.runUrl, historyId)}</tr>`;
  }
  return `${rowOpen('module', mod.passRate)}${name}</td>${healthCells(mod.passRate)}${countCells(mod.counts)}<td class="num">${formatDuration(mod.durationMs)}</td><td>${lastRun(mod.startTime, mod.stale, now)}</td>${historyCell(mod.runUrl, historyId)}</tr>`;
}

type CounterKind = keyof typeof ICONS;

const COUNTER_LABELS: Record<CounterKind, string> = { executed: 'Executed', passed: 'Passed', failed: 'Failed', flaky: 'Flaky', skipped: 'Skipped' };

// Order follows the Playwright HTML reporter. Executed is total minus skipped, the base of every rate.
// A zero count drops its icon and goes quiet.
const counters = (products: Dashboard['products']): string => {
  const sum = (pick: (counts: Counts) => number): number => products.reduce((total, product) => total + pick(product.counts), 0);
  const values: Record<CounterKind, number> = {
    executed: sum((counts) => counts.total - counts.skipped),
    passed: sum((counts) => counts.passed),
    failed: sum((counts) => counts.failed),
    flaky: sum((counts) => counts.flaky),
    skipped: sum((counts) => counts.skipped),
  };
  const total = values.executed + values.skipped;
  const items = (Object.keys(values) as CounterKind[]).map((kind) => {
    const zero = values[kind] === 0;
    const icon = zero ? '' : ICONS[kind];
    // Every counter shows its share of all cases (executed plus skipped). A zero count shows 0.0% but drops its icon.
    const share = total === 0 ? '' : `<span class="pct">${percent(values[kind] / total)}</span>`;
    return `<li class="counter ${kind}${zero ? ' zero' : ''}">${icon}<span class="count">${values[kind]}</span><span class="label">${COUNTER_LABELS[kind]}</span>${share}</li>`;
  });
  return `<ul class="counters">${items.join('')}</ul>`;
};

// Collapsing is CSS only. A checked box hides its group through :has(), so the page needs no script.
// A product box hides its repo groups. A repo box hides its module rows.
const foldRules = (products: Dashboard['products'], firstRepo: number[]): string =>
  products
    .flatMap((product, p) => [
      `main:has(#fold-p${p}:checked) tbody.in-p${p} { display: none; }`,
      ...product.repos.map((_, r) => `main:has(#fold-r${firstRepo[p] + r}:checked) tbody.in-r${firstRepo[p] + r} tr.module { display: none; }`),
    ])
    .join('\n');

export function render(dashboard: Dashboard, roseAtPassRate: number, trend: DashboardTrend | null = null): string {
  const firstRepo = dashboard.products.map((_, p) => dashboard.products.slice(0, p).reduce((total, product) => total + product.repos.length, 0));
  const groups = dashboard.products.flatMap((product, p) => [
    `<tbody class="head">\n${summaryRow('product', product.name, product, `p${p}`)}\n</tbody>`,
    ...product.repos.map((repo, r) => {
      const id = `r${firstRepo[p] + r}`;
      const modules = repo.modules.map((mod, m) => moduleRow(mod, dashboard.generatedAt, trend === null ? null : historyId(p, r, m)));
      return `<tbody class="in-p${p} in-${id}">\n${[summaryRow('repo', repo.name, repo, id), ...modules].join('\n')}\n</tbody>`;
    }),
  ]);
  const trendNote = trend === null ? '' : ` Cards above the table plot the pass rate per day over the last ${trend.days} days. The History column links each module to its trend on the history page.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>qack-pulse</title>
<style>${STYLE}${foldRules(dashboard.products, firstRepo)}</style>
</head>
<body>
<main>
<header>
<div>
<h1>qack-pulse</h1>
<p class="lede">Latest test automation results. Counts roll up from module to repo to product.</p>
</div>
<p class="generated">Generated ${formatDate(dashboard.generatedAt)} UTC+7</p>
</header>
${counters(dashboard.products)}
${trend === null ? '' : trendCards(dashboard, trend, roseAtPassRate)}
<div class="card">
<table style="--rose-at:${roseAtPassRate}">
<thead><tr><th class="name">Name</th><th>Health</th><th class="num">Total</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Skipped</th><th class="num">Flaky</th><th class="num">Duration</th><th>Last run (UTC+7)</th><th>${trend === null ? 'Run' : 'History'}</th></tr></thead>
${groups.join('\n')}
</table>
</div>
<p class="legend">Health is passed tests divided by executed tests (total minus skipped). The bar fades from teal at 100% to rose at ${Number((roseAtPassRate * 100).toFixed(1))}%. The tick marks that point. Flaky tests count as not passed. Counter percentages are shares of all cases.${trendNote}</p>
</main>
</body>
</html>
`;
}
