import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from '../src/render.ts';
import type { Dashboard } from '../src/rollup.ts';
import type { DashboardTrend } from '../src/trend.ts';

const counts = { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 };
const summary = { counts, passRate: 1, unhealthyRate: 0, modulesReporting: 1, modulesTotal: 1, modulesFailed: 0 };
const module = { name: 'API', status: 'ok', counts, passRate: 1, unhealthyRate: 0, durationMs: 1000, startTime: '2026-10-12T04:00:00Z', stale: false, runUrl: 'https://github.com/org/repo/actions/runs/1' };
const dashboard = { schemaVersion: 1, generatedAt: '2026-10-12T04:00:00Z', products: [{ name: 'Product', ...summary, repos: [{ name: 'Repo', ...summary, modules: [module] }] }] } as Dashboard;
const trend = { points: [], delta: null, direction: 'unknown' } as const;
const history = { days: 14, products: [{ name: 'Product', trend, repos: [{ name: 'Repo', trend, modules: [{ name: 'API', trend }] }] }] } as DashboardTrend;

test('labels relative dates and stale status as of the generated snapshot', () => {
  const html = render(dashboard, 0.8);
  assert.match(html, /Ages and stale status are as of generation/);
});

test('explains the current rate, historical comparison and carried-forward results near the trend cards', () => {
  const html = render(dashboard, 0.8, history);
  assert.match(html, /Current rate/);
  assert.match(html, /average of earlier days/);
  assert.match(html, /without a new result.*most recent result/i);
  assert.ok(html.indexOf('average of earlier days') < html.indexOf('<table'));
});

test('provides checked controls labelled for visible descendants and linked to their rows', () => {
  const html = render(dashboard, 0.8);
  assert.match(html, /type="checkbox" class="fold" id="fold-p0" role="switch" checked aria-label="Show repositories for Product" aria-controls="group-r0"/);
  assert.match(html, /type="checkbox" class="fold" id="fold-r0" role="switch" checked aria-label="Show modules for Repo" aria-controls="module-r0-0"/);
  assert.match(html, /<tbody id="group-r0"/);
  assert.match(html, /<tr id="module-r0-0"/);
  assert.match(html, /#fold-r0:not\(:checked\)/);
});

test('offers both direct run and history links for a reporting module', () => {
  const html = render(dashboard, 0.8, history);
  assert.match(html, /aria-label="Run for API">run<\/a>/);
  assert.match(html, /aria-label="History for API">history<\/a>/);
});

test('offers recovery guidance for missing data and failed results', () => {
  for (const [reason, guidance] of [
    ['no-run', /Check the workflow and branch/],
    ['artifact-expired', /Run the workflow again/],
    ['artifact-missing', /Check the workflow artifact/],
    ['stats-missing', /Check the report.*stats/],
    ['fetch-failed', /Check GitHub access.*try again/],
  ] as const) {
    const missing = { ...dashboard, products: [{ ...dashboard.products[0], repos: [{ ...dashboard.products[0].repos[0], modules: [{ ...module, status: 'no-data', reason, runDate: null }] }] }] } as Dashboard;
    assert.match(render(missing, 0.8), guidance);
  }
  const failed = { ...dashboard, products: [{ ...dashboard.products[0], repos: [{ ...dashboard.products[0].repos[0], modules: [{ ...module, status: 'run-failed', reason: 'stats-missing', runDate: null }] }] }] } as Dashboard;
  assert.match(render(failed, 0.8), /Check the report.*stats/);
});


test('keeps long trend-card names visible and able to wrap', () => {
  const html = render(dashboard, 0.8, history);
  const style = html.match(/\.trend-card h4 \{([^}]*)\}/)?.[1] ?? '';
  assert.match(style, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(style, /white-space:\s*nowrap|overflow:\s*hidden|text-overflow:\s*ellipsis/);
});


test('gives the daily pass-rate disclosure a comfortable touch target', () => {
  const html = render(dashboard, 0.8, history);
  assert.match(html, /\.trend-details summary \{[^}]*padding: 0\.75rem 0/);
});

test('surfaces modules needing attention with direct actions and context', () => {
  const failing = { ...module, counts: { ...counts, passed: 0, failed: 1 }, passRate: 0, stale: true };
  const data = { ...dashboard, products: [{ ...dashboard.products[0], repos: [{ ...dashboard.products[0].repos[0], modules: [failing] }] }] } as Dashboard;
  const html = render(data, 0.8, history);
  assert.match(html, /Needs attention/);
  assert.match(html, /Product \/ Repo \/ API/);
  assert.match(html, /Failed tests/);
  assert.match(html, /Stale/);
  assert.match(html, /aria-label="Run for API"/);
});

test('explains health near the table and flags incomplete rollups beside the rate', () => {
  const partial = { ...dashboard, products: [{ ...dashboard.products[0], modulesTotal: 2 }] } as Dashboard;
  const html = render(partial, 0.8);
  assert.ok(html.indexOf('Health is passed tests divided by executed tests') < html.indexOf('<table'));
  assert.match(html, /class="health"[^>]*>.*Incomplete: 1 of 2 modules reporting/);
});

test('makes hierarchy controls visibly labelled and limits sticky width on narrow screens', () => {
  const html = render(dashboard, 0.8);
  assert.match(html, /<label[^>]*for="fold-p0"[^>]*>.*Show repositories/s);
  assert.match(html, /role="switch"/);
  assert.match(html, /max-width: 7rem/);
});

test('lists missing and failed runs without treating unknown counts as failures', () => {
  const missing = { name: '<missing>', status: 'no-data', reason: 'no-run', runDate: null, stale: false, runUrl: null };
  const failed = { name: 'Failed run', status: 'run-failed', reason: 'stats-missing', runDate: '2026-10-12T04:00:00Z', stale: false, runUrl: 'https://github.com/org/repo/actions/runs/2' };
  const data = { ...dashboard, products: [{ ...dashboard.products[0], repos: [{ ...dashboard.products[0].repos[0], modules: [missing, failed] }] }] } as Dashboard;
  const html = render(data, 0.8);
  assert.match(html, /Product \/ Repo \/ &lt;missing&gt;<\/strong> <span class="attention-reason">No data/);
  assert.match(html, /Failed run<\/strong> <span class="attention-reason">Run failed/);
  assert.doesNotMatch(render(dashboard, 0.8), /<h2>Needs attention/);
});

test('groups repository reporting and failure status separately from its name', () => {
  const product = dashboard.products[0];
  const repo = { ...product.repos[0], modulesTotal: 2, modulesFailed: 1 };
  const html = render({ ...dashboard, products: [{ ...product, repos: [repo] }] }, 0.8);
  assert.match(html, /Repo<\/span> <span class="repo-status"><span class="sub">1 of 2 modules<\/span> <span class="badge">1 module failed<\/span><\/span>/);
});
