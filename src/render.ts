import type { NoDataReason, RunFailedDetail } from './collect.ts';
import type { Dashboard, ModuleRow, Summary } from './rollup.ts';
import { historyId } from './history-page.ts';
import { ICONS, LOGO } from './icons.ts';
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

const NEXT_STEPS: Record<NoDataReason, string> = {
  'no-run': 'Check the workflow and branch for a finished run.',
  'artifact-expired': 'Run the workflow again to create a new artifact.',
  'artifact-missing': 'Check the workflow artifact and its configured prefix.',
  'stats-missing': 'Check the report for Playwright stats.',
  'fetch-failed': 'Check GitHub access and try again.',
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
  return `${Math.max(0, days)}d old at generation`;
};

const lastRun = (iso: string | null, stale: boolean, now: string): string => {
  if (iso === null) return '';
  const badge = stale ? ' <span class="badge">stale</span>' : '';
  return `${formatDate(iso)} <span class="sub">${ageText(iso, now)}</span>${badge}`;
};

// Only GitHub https links become anchors. Anything else is dropped.
export const safeUrl = (url: string | null): string | null => (url !== null && /^https:\/\/github\.com\//.test(url) ? url : null);

const runLink = (url: string | null, name: string): string => {
  const href = safeUrl(url);
  return href === null ? '' : `<a href="${escapeHtml(href)}" aria-label="Run for ${escapeHtml(name)}">run</a>`;
};

const historyCell = (url: string | null, id: string | null, name: string): string =>
  `<td class="history">${[runLink(url, name), id === null ? '' : `<a href="history.html#${id}" aria-label="History for ${escapeHtml(name)}">history</a>`].filter(Boolean).join(' ')}</td>`;

// The row carries only the pass rate. CSS turns it into the health color.
// A failed run overrides the scale because its counts are unknown.
const rowOpen = (kind: string, passRate: number | null, failed = false, id = ''): string => {
  const state = failed ? ' run-failed' : passRate === null ? ' no-rate' : '';
  const rowId = id ? ` id="${id}"` : '';
  return passRate === null ? `<tr${rowId} class="${kind}${state}">` : `<tr${rowId} class="${kind}${state}" style="--pass:${Number(passRate.toFixed(4))}">`;
};

const healthCells = (passRate: number | null): string =>
  `<td class="health"><span class="swatch"></span>${passRate === null ? DASH : percent(passRate)}</td>`;

const countCells = (counts: Counts): string =>
  [counts.total, counts.passed, counts.failed, counts.skipped, counts.flaky]
    .map((count, index) => `<td class="num${index === 2 && count > 0 ? ' bad' : ''}">${count}</td>`)
    .join('');

const dashCells = Array(5).fill(`<td class="num">${DASH}</td>`).join('');

const fold = (id: string, name: string, controls: string[]): string => `<label class="fold-label" for="fold-${id}"><input type="checkbox" class="fold" id="fold-${id}" role="switch" checked aria-label="Show ${id.startsWith('p') ? 'repositories' : 'modules'} for ${escapeHtml(name)}"${controls.length ? ` aria-controls="${controls.join(' ')}"` : ''}>Show ${id.startsWith('p') ? 'repositories' : 'modules'}</label>`;

const summaryRow = (kind: string, name: string, summary: Summary, id: string, controls: string[]): string => {
  const failed = summary.modulesFailed > 0 ? ` <span class="badge">${summary.modulesFailed} ${summary.modulesFailed === 1 ? 'module' : 'modules'} failed</span>` : '';
  const counts = summary.modulesReporting === 0 ? dashCells : countCells(summary.counts);
  const rate = summary.modulesReporting === 0 ? null : summary.passRate;
  const coverage = summary.modulesReporting < summary.modulesTotal ? `<span class="incomplete">Incomplete: ${summary.modulesReporting} of ${summary.modulesTotal} modules reporting</span>` : '';
  const details = `<span class="sub">${summary.modulesReporting} of ${summary.modulesTotal} modules</span>${failed}`;
  const label = `<span class="summary-name">${escapeHtml(name)}</span> <span class="summary-status">${details}</span>`;
  return `${rowOpen(kind, rate, summary.modulesFailed > 0)}<th scope="row" class="name">${label}${fold(id, name, controls)}</th>${healthCells(rate).replace('</td>', `${coverage}</td>`)}${counts}<td></td><td></td><td></td></tr>`;
};

const attention = (dashboard: Dashboard, trend: DashboardTrend | null): string => {
  const items = dashboard.products.flatMap((product, p) => product.repos.flatMap((repo, r) => repo.modules.flatMap((mod, m) => {
    const reasons = [mod.status === 'no-data' ? 'No data' : '', mod.status === 'run-failed' ? 'Run failed' : '', mod.status === 'ok' && mod.counts.failed > 0 ? 'Failed tests' : '', mod.stale ? 'Stale' : ''].filter(Boolean);
    if (!reasons.length) return [];
    const path = [product.name, repo.name, mod.name].map(escapeHtml).join(' / ');
    const links = [runLink(mod.runUrl, mod.name), trend === null ? '' : `<a href="history.html#${historyId(p, r, m)}" aria-label="History for ${escapeHtml(mod.name)}">history</a>`].filter(Boolean).join(' ');
    return [`<li><span><strong>${path}</strong> <span class="attention-reason">${reasons.join(' · ')}</span></span><span class="attention-links">${links}</span></li>`];
  })));
  return items.length ? `<section class="attention"><h2>Needs attention <span>(${items.length})</span></h2><ul>${items.join('')}</ul></section>` : '';
};

function moduleRow(mod: ModuleRow, now: string, historyId: string | null, id: string): string {
  const name = `<th scope="row" class="name">${escapeHtml(mod.name)}`;
  if (mod.status === 'no-data') {
    return `${rowOpen('module no-data', null, false, id)}${name}</th>${healthCells(null)}<td colspan="5" class="reason">No data: ${REASONS[mod.reason]}. ${NEXT_STEPS[mod.reason]}</td><td></td><td>${lastRun(mod.runDate, mod.stale, now)}</td>${historyCell(mod.runUrl, historyId, mod.name)}</tr>`;
  }
  if (mod.status === 'run-failed') {
    return `${rowOpen('module', null, true, id)}${name}</th>${healthCells(null)}<td colspan="5" class="failed-text">Run failed, no results <span class="sub">(${DETAILS[mod.reason]}). ${NEXT_STEPS[mod.reason]}</span></td><td></td><td>${lastRun(mod.runDate, mod.stale, now)}</td>${historyCell(mod.runUrl, historyId, mod.name)}</tr>`;
  }
  return `${rowOpen('module', mod.passRate, false, id)}${name}</th>${healthCells(mod.passRate)}${countCells(mod.counts)}<td class="num">${formatDuration(mod.durationMs)}</td><td>${lastRun(mod.startTime, mod.stale, now)}</td>${historyCell(mod.runUrl, historyId, mod.name)}</tr>`;
}

type CounterKind = keyof typeof ICONS;

const COUNTER_LABELS: Record<CounterKind, string> = { executed: 'Executed', passed: 'Passed', failed: 'Failed', flaky: 'Flaky', skipped: 'Skipped' };

// Order follows the Playwright HTML reporter. Executed is total minus skipped, the base of every rate.
// A zero count drops its icon and goes quiet.
const counters = (products: Dashboard['products']): string => {
  const reporting = products.reduce((total, product) => total + product.modulesReporting, 0);
  const modules = products.reduce((total, product) => total + product.modulesTotal, 0);
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
    const zero = values[kind] === 0 || reporting === 0;
    const icon = zero ? '' : ICONS[kind];
    // Every counter shows its share of all cases (executed plus skipped). A zero count shows 0.0% but drops its icon.
    const share = total === 0 || reporting === 0 ? '' : `<span class="pct">${percent(values[kind] / total)}</span>`;
    return `<li class="counter ${kind}${zero ? ' zero' : ''}">${icon}<span class="count">${reporting === 0 ? DASH : values[kind]}</span><span class="label">${COUNTER_LABELS[kind]}</span>${share}</li>`;
  });
  return `<p class="coverage">${reporting} of ${modules} modules reporting</p><ul class="counters">${items.join('')}</ul>`;
};

// Collapsing is CSS only. An unchecked box hides its group through :has().
// A product box hides its repo groups. A repo box hides its module rows.
const foldRules = (products: Dashboard['products'], firstRepo: number[]): string =>
  products
    .flatMap((product, p) => [
      `main:has(#fold-p${p}:not(:checked)) tbody.in-p${p} { display: none; }`,
      ...product.repos.map((_, r) => `main:has(#fold-r${firstRepo[p] + r}:not(:checked)) tbody.in-r${firstRepo[p] + r} tr.module { display: none; }`),
    ])
    .join('\n');

export function render(dashboard: Dashboard, roseAtPassRate: number, trend: DashboardTrend | null = null): string {
  const firstRepo = dashboard.products.map((_, p) => dashboard.products.slice(0, p).reduce((total, product) => total + product.repos.length, 0));
  const groups = dashboard.products.flatMap((product, p) => [
    `<tbody class="head">\n${summaryRow('product', product.name, product, `p${p}`, product.repos.map((_, r) => `group-r${firstRepo[p] + r}`))}\n</tbody>`,
    ...product.repos.map((repo, r) => {
      const id = `r${firstRepo[p] + r}`;
      const moduleIds = repo.modules.map((_, m) => `module-${id}-${m}`);
      const modules = repo.modules.map((mod, m) => moduleRow(mod, dashboard.generatedAt, trend === null ? null : historyId(p, r, m), moduleIds[m]));
      return `<tbody id="group-${id}" class="in-p${p} in-${id}">\n${[summaryRow('repo', repo.name, repo, id, moduleIds), ...modules].join('\n')}\n</tbody>`;
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
<div class="brand">
${LOGO}
<div>
<h1>QACK <span class="accent">PULSE</span></h1>
<p class="lede">Latest test automation results. Counts roll up from module to repo to product.</p>
</div>
</div>
<p class="generated">Generated ${formatDate(dashboard.generatedAt)} UTC+7<br>Ages and stale status are as of generation.</p>
</header>
${counters(dashboard.products)}
${attention(dashboard, trend)}
${trend === null ? '' : trendCards(dashboard, trend, roseAtPassRate)}
<p class="health-explainer">Health is passed tests divided by executed tests (total minus skipped). The bar's tick marks ${Number((roseAtPassRate * 100).toFixed(1))}%; flaky tests count as not passed.</p>
<p class="scroll-hint" id="table-scroll-hint">Scroll horizontally to see all columns.</p>
<div class="card" role="region" aria-label="Test results" aria-describedby="table-scroll-hint" tabindex="0">
<table style="--rose-at:${roseAtPassRate}">
<thead><tr><th class="name">Name</th><th>Health</th><th class="num">Total</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Skipped</th><th class="num">Flaky</th><th class="num">Duration</th><th>Last run (UTC+7)</th><th>${trend === null ? 'Run' : 'Run / History'}</th></tr></thead>
${groups.join('\n')}
</table>
</div>
<p class="legend">Health is passed tests divided by executed tests (total minus skipped). The bar fades from teal at 100% to rose at ${Number((roseAtPassRate * 100).toFixed(1))}%. The tick marks that point. Flaky tests count as not passed. Counter percentages are shares of all cases.${trendNote}</p>
</main>
</body>
</html>
`;
}
