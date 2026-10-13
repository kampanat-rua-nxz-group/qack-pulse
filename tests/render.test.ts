import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml, render } from '../src/render.ts';
import type { Dashboard } from '../src/rollup.ts';
import type { DashboardTrend, Trend } from '../src/trend.ts';

const counts = { total: 100, passed: 80, failed: 10, skipped: 4, flaky: 6 };
const summary = { counts, passRate: 80 / 96, unhealthyRate: 16 / 96, modulesReporting: 1, modulesTotal: 1, modulesFailed: 0 };
const RUN_URL = 'https://github.com/nxz-group/lockbox-api-automation/actions/runs/102';

const okModule = {
  name: 'merchant-api',
  status: 'ok' as const,
  counts,
  passRate: 80 / 96,
  unhealthyRate: 16 / 96,
  durationMs: 184213,
  startTime: '2026-10-12T03:35:35.439Z',
  stale: false,
  runUrl: RUN_URL,
};

const noDataModule = {
  name: 'backoffice-ui',
  status: 'no-data' as const,
  reason: 'artifact-expired' as const,
  runDate: '2025-10-02T05:56:11Z',
  stale: true,
  runUrl: 'https://github.com/nxz-group/lockbox-ui-automation/actions/runs/77',
};

const dashboard = (module: Record<string, unknown> = okModule, repoSummary = summary): Dashboard =>
  ({
    schemaVersion: 1,
    generatedAt: '2026-10-12T04:00:00.000Z',
    products: [{ name: 'Lockbox', ...repoSummary, repos: [{ name: 'lockbox-api-automation', ...repoSummary, modules: [module] }] }],
  }) as Dashboard;

const noRate = { ...summary, passRate: null, unhealthyRate: null };

test('escapes the five HTML characters', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
});

test('shows a row for the product, the repo, and the module with its counts', () => {
  const html = render(dashboard(), 0.8);
  assert.match(html, /<tr class="product" style="--pass:0\.8333"><td class="name">Lockbox <span class="sub">1 of 1 modules<\/span>/);
  assert.match(html, /<tr class="repo" style="--pass:0\.8333"><td class="name">lockbox-api-automation <span class="sub">1 of 1 modules<\/span>/);
  assert.match(html, /<tr class="module" style="--pass:0\.8333"><td class="name">merchant-api<\/td>/);
  assert.match(html, /<td class="num">100<\/td><td class="num">80<\/td><td class="num bad">10<\/td><td class="num">4<\/td><td class="num">6<\/td>/);
});

test('prints the pass rate beside the health color', () => {
  assert.match(render(dashboard(), 0.8), /<td class="health"><span class="swatch"><\/span>83\.3%<\/td>/);
});

test('mixes the health color from teal at 100 percent to rose at roseAtPassRate', () => {
  const html = render(dashboard(), 0.8);
  assert.match(html, /--color-brand-primary: #2dd4bf;/);
  assert.match(html, /--color-form-error: #f43f5e;/);
  assert.match(html, /--tealShare: clamp\(0, \(var\(--pass\) - var\(--rose-at\)\) \/ \(1 - var\(--rose-at\)\), 1\);/);
  assert.match(html, /--health: color-mix\(in oklch, var\(--color-brand-primary\) calc\(var\(--tealShare\) \* 100%\), var\(--color-form-error\)\);/);
  assert.match(html, /<table style="--rose-at:0\.8">/);
  assert.match(render(dashboard({ ...okModule, passRate: 1 }), 0.8), /<tr class="module" style="--pass:1">/);
  assert.match(render(dashboard({ ...okModule, passRate: 0.8 }), 0.8), /<tr class="module" style="--pass:0\.8">/);
  assert.match(render(dashboard(), 0.5), /<table style="--rose-at:0\.5">/);
});

test('uses grey and no rate when every test is skipped', () => {
  const html = render(dashboard({ ...okModule, passRate: null, unhealthyRate: null }), 0.8);
  assert.match(html, /--color-health-none: #918a8f;/);
  assert.match(html, /tr\.no-rate \{ --health: var\(--color-health-none\); \}/);
  assert.match(html, /<tr class="module no-rate"><td class="name">merchant-api<\/td><td class="health"><span class="swatch"><\/span>\u2014<\/td>/);
});

test('uses grey for a repo and product where no module reported', () => {
  const html = render(dashboard(noDataModule, { ...noRate, modulesReporting: 0 }), 0.8);
  assert.match(html, /<tr class="product no-rate"><td class="name">Lockbox <span class="sub">0 of 1 modules<\/span>/);
  assert.match(html, /<tr class="repo no-rate">/);
});

test('shows the run duration on module rows only', () => {
  const html = render(dashboard(), 0.8);
  assert.match(html, /<td class="num">3m 04s<\/td><td>2026-10-12 10:35 <span class="sub">today<\/span><\/td>/);
  assert.equal(html.match(/3m 04s/g)?.length, 1);
  assert.match(render(dashboard({ ...okModule, durationMs: 45400 }), 0.8), /<td class="num">45s<\/td>/);
  assert.match(render(dashboard({ ...okModule, durationMs: 3_725_000 }), 0.8), /<td class="num">1h 02m<\/td>/);
  assert.match(render(dashboard({ ...okModule, durationMs: null }), 0.8), /<td class="num"><\/td><td>2026-10-12 10:35 <span class="sub">today<\/span><\/td>/);
});

test('shows the generation time, the last run time, and a link to the run', () => {
  const html = render(dashboard(), 0.8);
  assert.match(html, /Generated 2026-10-12 11:00 UTC\+7/);
  assert.match(html, /<a href="https:\/\/github\.com\/nxz-group\/lockbox-api-automation\/actions\/runs\/102">run<\/a>/);
});

test('flags a stale module', () => {
  assert.doesNotMatch(render(dashboard(), 0.8), /<span class="badge">/);
  assert.match(render(dashboard({ ...okModule, stale: true }), 0.8), /2026-10-12 10:35 <span class="sub">today<\/span> <span class="badge">stale<\/span><\/td>/);
});

test('shows why a module has no data, with the date and link of its last run', () => {
  const html = render(dashboard(noDataModule), 0.8);
  assert.match(html, /<tr class="module no-data no-rate"><td class="name">backoffice-ui<\/td><td class="health"><span class="swatch"><\/span>\u2014<\/td><td colspan="5" class="reason">No data: the artifact has expired<\/td>/);
  assert.match(html, /2025-10-02 12:56 <span class="sub">374d ago<\/span> <span class="badge">stale<\/span>/);
  assert.match(html, /actions\/runs\/77">run<\/a>/);
});

test('shows a module without any run as no data with no date and no link', () => {
  const html = render(dashboard({ ...noDataModule, reason: 'no-run', runDate: null, stale: false, runUrl: null }), 0.8);
  assert.match(html, /No data: no finished run on the branch<\/td><td><\/td><td><\/td><td class="history"><\/td><\/tr>/);
});

test('escapes names that come from the config', () => {
  const html = render(dashboard({ ...okModule, name: '<script>alert(1)</script>' }), 0.8);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('drops a run link that is not a GitHub https address', () => {
  const html = render(dashboard({ ...okModule, runUrl: 'javascript:alert(1)' }), 0.8);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /<a /);
});

test('is one self-contained file with no scripts and no outside resources', () => {
  const html = render(dashboard(), 0.8);
  assert.doesNotMatch(html, /<script|<link|src=|@import|url\(/);
});

const runFailedModule = {
  name: 'onboard-api',
  status: 'run-failed' as const,
  reason: 'stats-missing' as const,
  counts: null,
  passRate: null,
  unhealthyRate: null,
  durationMs: null,
  runDate: '2026-10-12T03:33:42Z',
  stale: false,
  runUrl: RUN_URL,
};

test('shows a run-failed module as rose with its detail, date, age, and link', () => {
  const html = render(dashboard(runFailedModule), 0.8);
  assert.match(html, /tr\.run-failed \{ --health: var\(--color-form-error\); \}/);
  assert.match(html, /<tr class="module run-failed"><td class="name">onboard-api<\/td>/);
  assert.match(html, /Run failed, no results <span class="sub">\(the report has no stats\)<\/span><\/td>/);
  assert.match(html, /2026-10-12 10:33 <span class="sub">today<\/span><\/td><td class="history"><a href=/);
});

test('turns a repo and product rose and badges the failed modules, even with a high pass rate', () => {
  const html = render(dashboard(okModule, { ...summary, modulesFailed: 2, modulesTotal: 3 }), 0.8);
  assert.match(html, /<tr class="product run-failed" style="--pass:0\.8333"><td class="name">Lockbox <span class="sub">1 of 3 modules<\/span> <span class="badge">2 modules failed<\/span>/);
  assert.match(render(dashboard(okModule, { ...summary, modulesFailed: 1 }), 0.8), /1 module failed/);
});

test('shows a dash, not zero, in every count and rate column when no module reported', () => {
  const html = render(dashboard(noDataModule, { ...noRate, counts: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 }, modulesReporting: 0 }), 0.8);
  const dashes = '<td class="num">\u2014</td>'.repeat(5);
  assert.match(html, new RegExp(`<tr class="repo no-rate">.*?\u2014</td>${dashes}`));
  assert.doesNotMatch(html, /<tr class="repo[^>]*>.*?<td class="num">0<\/td>/);
});

test('explains how health is calculated and where the rose threshold sits', () => {
  const html = render(dashboard(), 0.8);
  assert.match(html, /<p class="legend">Health is passed tests divided by executed tests \(total minus skipped\)\. The bar fades from teal at 100% to rose at 80%\./);
  assert.match(render(dashboard(), 0.855), /rose at 85\.5%\./);
});

test('draws the health bar as a track, a fill, and a threshold tick, and respects reduced motion', () => {
  const html = render(dashboard(), 0.8);
  assert.match(html, /\.swatch::after \{[^}]*width: calc\(var\(--pass, 0\) \* 100%\);[^}]*background: var\(--health\);/);
  assert.match(html, /\.swatch::before \{[^}]*left: calc\(var\(--rose-at\) \* 100%\);/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
});

const counter = (html: string, status: string): string => html.match(new RegExp(`<li class="counter ${status}[^"]*"[^>]*>.*?</li>`))?.[0] ?? '';

test('shows status counters in the order executed, passed, failed, flaky, skipped, summed across products', () => {
  const html = render(dashboard(), 0.8);
  const order = [...html.matchAll(/<li class="counter (\w+)/g)].map((match) => match[1]);
  assert.deepEqual(order, ['executed', 'passed', 'failed', 'flaky', 'skipped']);
  assert.match(counter(html, 'executed'), /<span class="count">96<\/span><span class="label">Executed<\/span>/);
  assert.match(counter(html, 'failed'), /<svg[^>]*aria-hidden="true"[^>]*>.*<\/svg><span class="count">10<\/span><span class="label">Failed<\/span>/);
});

test('hides the counter icon when the count is zero', () => {
  const html = render(dashboard(okModule, { ...summary, counts: { ...counts, failed: 0 } }), 0.8);
  assert.match(counter(html, 'failed zero'), /^<li class="counter failed zero"><span class="count">0<\/span>/);
  assert.doesNotMatch(counter(html, 'failed zero'), /<svg/);
});

test('says that flaky tests count as not passed', () => {
  assert.match(render(dashboard(), 0.8), /Flaky tests count as not passed\./);
});

const twoRepos = (): Dashboard =>
  ({
    schemaVersion: 1,
    generatedAt: '2026-10-12T04:00:00.000Z',
    products: [
      { name: 'Lockbox', ...summary, repos: [{ name: 'api', ...summary, modules: [okModule] }, { name: 'ui', ...summary, modules: [okModule, noDataModule] }] },
      { name: 'Other', ...summary, repos: [{ name: 'misc', ...summary, modules: [okModule] }] },
    ],
  }) as Dashboard;

test('puts a fold checkbox with a label in each product and repo row, and none in module rows', () => {
  const html = render(twoRepos(), 0.8);
  assert.equal(html.match(/<input type="checkbox" class="fold"/g)?.length, 5);
  assert.match(html, /<td class="name">Lockbox <span class="sub">.*?<input type="checkbox" class="fold" id="fold-p0" aria-label="Collapse Lockbox"><\/td>/);
  assert.match(html, /<input type="checkbox" class="fold" id="fold-r1" aria-label="Collapse ui"><\/td>/);
  assert.match(html, /<input type="checkbox" class="fold" id="fold-r2" aria-label="Collapse misc"><\/td>/);
  assert.doesNotMatch(html, /<tr class="module[^>]*>[^\n]*<input/);
});

test('groups each repo and its modules in one tbody tagged with its product and repo', () => {
  const html = render(twoRepos(), 0.8);
  assert.equal(html.match(/<tbody class="head">/g)?.length, 2);
  assert.match(html, /<tbody class="in-p0 in-r0">\n<tr class="repo"/);
  assert.match(html, /<tbody class="in-p0 in-r1">\n<tr class="repo"/);
  assert.match(html, /<tbody class="in-p1 in-r2">\n<tr class="repo"/);
});

test('hides a repo\'s modules or a product\'s repos when the matching checkbox is checked', () => {
  const html = render(twoRepos(), 0.8);
  assert.match(html, /main:has\(#fold-r1:checked\) tbody\.in-r1 tr\.module \{ display: none; \}/);
  assert.match(html, /main:has\(#fold-p1:checked\) tbody\.in-p1 \{ display: none; \}/);
  assert.doesNotMatch(html, /fold-r3|fold-p2/);
});

test('escapes the name in the fold label', () => {
  const data = twoRepos();
  const html = render({ ...data, products: [{ ...data.products[0], name: 'A"><b>' }] }, 0.8);
  assert.match(html, /aria-label="Collapse A&quot;&gt;&lt;b&gt;"/);
  assert.doesNotMatch(html, /<b>/);
});

const trendOf = (direction: Trend['direction'], delta: number | null, rates: (number | null)[] = [0.9, 0.9, 0.9, 0.8]): Trend => ({
  direction,
  delta,
  points: rates.map((passRate, index) => ({ date: `2026-10-${String(index + 1).padStart(2, '0')}`, counts: null, passRate })),
});
const trendFor = (trend: Trend): DashboardTrend => ({
  days: 14,
  products: [{ name: 'Lockbox', trend, repos: [{ name: 'lockbox-api-automation', trend, modules: [{ name: 'merchant-api', trend }] }] }],
});

test('has no trend column in the table', () => {
  const html = render(dashboard(), 0.8, trendFor(trendOf('worse', -0.021)));
  assert.doesNotMatch(html, /<th>Trend<\/th>/);
  assert.doesNotMatch(html, /<td class="trend/);
});

test('shows no trend section when no trend is given', () => {
  assert.doesNotMatch(render(dashboard(), 0.8), /class="trends"/);
});

test('shows a card per repo above the table, under a heading for its product', () => {
  const html = render(dashboard(), 0.8, trendFor(trendOf('worse', -0.021)));
  assert.equal((html.match(/<article class="trend-card worse"/g) ?? []).length, 1);
  assert.equal((html.match(/<svg class="spark"/g) ?? []).length, 1);
  assert.match(html, /<h2>Lockbox pass rate, last 14 days<\/h2>/);
  assert.doesNotMatch(html, /<h3>/);
  assert.doesNotMatch(html, /Lockbox overview/);
  assert.match(html, /<h4>lockbox-api-automation<\/h4>/);
  assert.ok(html.indexOf('class="trends"') < html.indexOf('<table'));
});

test('escapes names in the trend cards', () => {
  const trend = trendFor(trendOf('flat', 0));
  const html = render(dashboard(), 0.8, { ...trend, products: [{ ...trend.products[0], name: '<b>' }] });
  assert.match(html, /<h2>&lt;b&gt; pass rate, last/);
});

test('shows an up delta, flat, and not enough history in plain words', () => {
  assert.match(render(dashboard(), 0.8, trendFor(trendOf('better', 0.005))), /<span class="delta">▲ 0\.5 pts<\/span>/);
  assert.match(render(dashboard(), 0.8, trendFor(trendOf('flat', 0.002))), /<span class="delta">flat<\/span>/);
  const empty = render(dashboard(), 0.8, trendFor(trendOf('unknown', null, [null, null])));
  assert.match(empty, /<span class="delta">not enough history<\/span>/);
  assert.doesNotMatch(empty, /<svg class="spark"/);
});

test('explains the trend in the legend only when a trend is given', () => {
  assert.match(render(dashboard(), 0.8, trendFor(trendOf('flat', 0))), /plot the pass rate/);
  assert.doesNotMatch(render(dashboard(), 0.8), /plot the pass rate/);
});

test('puts an overview card for the product first when it has more than one repo', () => {
  const base = dashboard();
  const product = base.products[0];
  const two = { ...base, products: [{ ...product, repos: [product.repos[0], { ...product.repos[0], name: 'lockbox-bo-api-automation' }] }] } as Dashboard;
  const trend = trendOf('worse', -0.021);
  const repo = (name: string) => ({ name, trend, modules: [] });
  const html = render(two, 0.8, { days: 14, products: [{ name: 'Lockbox', trend, repos: [repo('lockbox-api-automation'), repo('lockbox-bo-api-automation')] }] });
  assert.equal((html.match(/<article class="trend-card worse/g) ?? []).length, 3);
  assert.match(html, /<article class="trend-card worse overview"[^>]*>\n<h4>Lockbox overview<\/h4>/);
  assert.ok(html.indexOf('Lockbox overview') < html.indexOf('<h4>lockbox-api-automation</h4>'));
});

test('shows every counter as a share of all cases, skipped included', () => {
  const html = render(dashboard(), 0.8);
  const share = (kind: string): string | undefined => counter(html, kind).match(/<span class="pct">([^<]*)<\/span>/)?.[1];
  assert.equal(share('executed'), '96.0%');
  assert.equal(share('passed'), '80.0%');
  assert.equal(share('failed'), '10.0%');
  assert.equal(share('flaky'), '6.0%');
  assert.equal(share('skipped'), '4.0%');
});

test('shows 0.0% on a zero counter and no share when there are no cases', () => {
  const html = render(dashboard(okModule, { ...summary, counts: { ...counts, failed: 0 } }), 0.8);
  assert.match(counter(html, 'failed zero'), /<span class="pct">0\.0%<\/span><\/li>$/);
  const none = { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
  assert.doesNotMatch(render(dashboard(okModule, { ...summary, counts: none }), 0.8), /class="pct"/);
});

test('links each module row to its card on the history page when a trend is given', () => {
  const html = render(dashboard(), 0.8, trendFor(trendOf('worse', -0.021)));
  assert.match(html, /<th>History<\/th>/);
  assert.doesNotMatch(html, /<th>Run<\/th>/);
  assert.match(html, /<td class="history"><a href="history\.html#m-0-0-0">history<\/a><\/td><\/tr>/);
  assert.doesNotMatch(html, />run<\/a>/);
});

test('links no-data and run-failed modules to the history page too, and only module rows', () => {
  assert.match(render(dashboard(noDataModule), 0.8, trendFor(trendOf('flat', 0))), /<td class="history"><a href="history\.html#m-0-0-0">history<\/a><\/td>/);
  assert.match(render(dashboard(runFailedModule), 0.8, trendFor(trendOf('flat', 0))), /<td class="history"><a href="history\.html#m-0-0-0">history<\/a><\/td>/);
  assert.equal(render(dashboard(), 0.8, trendFor(trendOf('flat', 0))).match(/class="history"/g)?.length, 1);
});

test('keeps the Run column and its link when no trend is given', () => {
  const html = render(dashboard(), 0.8);
  assert.match(html, /<th>Run<\/th>/);
  assert.doesNotMatch(html, /history\.html/);
  assert.match(html, /<td class="history"><a href="https:\/\/github\.com\/[^"]*">run<\/a><\/td>/);
});
