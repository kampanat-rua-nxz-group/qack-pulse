import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderHistory } from '../src/history-page.ts';
import type { HistoryLine } from '../src/history.ts';
import type { Dashboard } from '../src/rollup.ts';

const RUN_URL = 'https://github.com/nxz-group/lockbox-api-automation/actions/runs/102';
const NOW = new Date('2026-10-12T04:00:00Z');
const counts = { total: 100, passed: 80, failed: 10, skipped: 4, flaky: 6 };
const summary = { counts, passRate: 80 / 96, unhealthyRate: 16 / 96, modulesReporting: 2, modulesTotal: 2, modulesFailed: 0 };

const module = (name: string) => ({
  name,
  status: 'ok' as const,
  counts,
  passRate: 80 / 96,
  unhealthyRate: 16 / 96,
  durationMs: 1000,
  startTime: '2026-10-12T03:35:35.439Z',
  stale: false,
  runUrl: RUN_URL,
});

const dashboard = (names = ['merchant-api', 'onboard-api'], product = 'Lockbox'): Dashboard =>
  ({
    schemaVersion: 1,
    generatedAt: '2026-10-12T04:00:00.000Z',
    products: [{ name: product, ...summary, repos: [{ name: 'lockbox-api-automation', ...summary, modules: names.map(module) }] }],
  }) as Dashboard;

const line = (overrides: HistoryLine = {}): HistoryLine => ({
  schemaVersion: 1,
  repo: 'lockbox-api-automation',
  module: 'merchant-api',
  runId: 1,
  attempt: 1,
  artifact: 'report-merchant-1',
  workflow: 'regression.yaml',
  event: 'schedule',
  startTime: '2026-10-09T03:00:00.000Z',
  durationMs: 1000,
  passed: 80,
  failed: 10,
  skipped: 4,
  flaky: 6,
  runUrl: RUN_URL,
  ...overrides,
});

const page = (rows: HistoryLine[] = [line()], data = dashboard()): string => renderHistory(data, rows, NOW, 0.8);

// The section of one workflow job, so a test only sees that job's calendar.
const section = (html: string, id: string): string => html.match(new RegExp(`<section class="job" id="${id}">.*?</section>`, 's'))?.[0] ?? '';

test('shows one calendar section per workflow job, under its repo and product', () => {
  const html = page();
  assert.equal((html.match(/<section class="job"/g) ?? []).length, 2);
  assert.match(section(html, 'm-0-0-0'), /<h2>merchant-api <span class="sub">Lockbox \/ lockbox-api-automation<\/span><\/h2>/);
  assert.match(section(html, 'm-0-0-1'), /<h2>onboard-api /);
});

test('lets the reader pick a job from a list of links to the sections', () => {
  const html = page();
  assert.match(html, /<nav class="picker"[^>]*>.*<a href="#m-0-0-0">merchant-api<\/a>.*<a href="#m-0-0-1">onboard-api<\/a>.*<\/nav>/s);
});

test('shows only the selected job, or the first one when none is selected', () => {
  const html = page();
  assert.match(html, /\.job \{ display: none; \}/);
  assert.match(html, /\.job:target \{ display: block; \}/);
  assert.match(html, /main:not\(:has\(\.job:target\)\) \.job:first-of-type \{ display: block; \}/);
});

const august = line({ startTime: '2026-08-20T03:00:00Z', runId: 7 });
const months = (html: string): (string | undefined)[] => [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((match) => match[1]);

test('has a month for every month from the oldest run to now, newest first', () => {
  assert.deepEqual(months(section(page([august, line()]), 'm-0-0-0')), ['October 2026', 'September 2026', 'August 2026']);
});

test('shows only the current month when the history starts this month', () => {
  assert.deepEqual(months(section(page(), 'm-0-0-0')), ['October 2026']);
});

test('shows only the current month when there is no history at all', () => {
  assert.deepEqual(months(section(page([]), 'm-0-0-0')), ['October 2026']);
});

test('goes back at most 12 months', () => {
  const old = line({ startTime: '2024-01-05T03:00:00Z', runId: 8 });
  const listed = months(section(page([old, line()]), 'm-0-0-0'));
  assert.equal(listed.length, 12);
  assert.equal(listed[11], 'November 2025');
});

test('opens on the current month and shows one month at a time', () => {
  const html = section(page([august, line()]), 'm-0-0-0');
  assert.equal((html.match(/<input type="radio"/g) ?? []).length, 3);
  assert.match(html, /<input type="radio" class="mon mon-0" name="m-0-0-0-month" id="m-0-0-0-0" checked>/);
  assert.match(html, /<input type="radio" class="mon mon-1" name="m-0-0-0-month" id="m-0-0-0-1">/);
  assert.equal((html.match(/ checked>/g) ?? []).length, 1);
  const css = page([august, line()]);
  assert.match(css, /\.month \{[^}]*display: none;/);
  assert.match(css, /\.mon-0:checked ~ \.months \.month-0 \{ display: block; \}/);
  assert.match(css, /\.mon-2:checked ~ \.months \.month-2 \{ display: block; \}/);
});

test('links Previous and Next to the neighbouring months and disables them at the ends', () => {
  const html = section(page([august, line()]), 'm-0-0-0');
  const month = (name: string): string => html.match(new RegExp(`<div class="month month-\\d">\\n<div class="month-head">.*?<h3>${name}</h3>.*?</div>`, 's'))?.[0] ?? '';
  assert.match(month('October 2026'), /<label class="nav" for="m-0-0-0-1">Previous<\/label><h3>October 2026<\/h3><span class="nav off">Next<\/span>/);
  assert.match(month('September 2026'), /<label class="nav" for="m-0-0-0-2">Previous<\/label><h3>September 2026<\/h3><label class="nav" for="m-0-0-0-0">Next<\/label>/);
  assert.match(month('August 2026'), /<span class="nav off">Previous<\/span><h3>August 2026<\/h3><label class="nav" for="m-0-0-0-1">Next<\/label>/);
});

test('keeps the month choice of each job apart', () => {
  const html = page([august, line()]);
  assert.match(section(html, 'm-0-0-1'), /name="m-0-0-1-month" id="m-0-0-1-0" checked/);
});

test('starts each week on Sunday and pads the days before the first of the month', () => {
  const october = section(page(), 'm-0-0-0').match(/<h3>October 2026<\/h3>.*?<\/ol>/s)?.[0] ?? '';
  const weekdays = [...october.matchAll(/<li class="dow">(\w+)<\/li>/g)].map((match) => match[1]);
  assert.deepEqual(weekdays, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.match(october, /(<li class="pad"><\/li>){4}<li class="day none"><b>1<\/b><\/li>/);
  assert.equal((october.match(/class="day /g) ?? []).length, 31);
});

test('colors a day with a run by its pass rate and links it to the run', () => {
  const cell = section(page(), 'm-0-0-0').match(/<li class="day ran"[^>]*>.*?<\/li>/)?.[0] ?? '';
  assert.equal(cell, `<li class="day ran" style="--pass:0.8333"><a href="${RUN_URL}" title="2026-10-09: 80 passed, 10 failed, 4 skipped, 6 flaky"><b>9</b><span>83.3%</span></a></li>`);
});

test('shows a day without a run as an empty cell with no link', () => {
  assert.match(section(page(), 'm-0-0-0'), /<li class="day none"><b>8<\/b><\/li>/);
});

test('marks days after today so they are not read as missed runs', () => {
  const html = section(page(), 'm-0-0-0');
  assert.match(html, /<li class="day none"><b>12<\/b><\/li>/);
  assert.match(html, /<li class="day none future"><b>13<\/b><\/li>/);
});

test('adds up the shards of one run and keeps only the newest run of a day', () => {
  const rows = [
    line({ runId: 1, artifact: 'a', startTime: '2026-10-09T01:00:00Z', passed: 10, failed: 0, skipped: 0, flaky: 0 }),
    line({ runId: 2, artifact: 'a', startTime: '2026-10-09T05:00:00Z', passed: 30, failed: 10, skipped: 0, flaky: 0, runUrl: `${RUN_URL}9` }),
    line({ runId: 2, artifact: 'b', startTime: '2026-10-09T05:01:00Z', passed: 30, failed: 0, skipped: 0, flaky: 0, runUrl: `${RUN_URL}9` }),
  ];
  const html = section(page(rows), 'm-0-0-0');
  assert.match(html, /<li class="day ran" style="--pass:0\.8571"><a href="[^"]*9" title="2026-10-09: 60 passed, 10 failed, 0 skipped, 0 flaky"><b>9<\/b><span>85\.7%<\/span>/);
  assert.equal((html.match(/class="day ran/g) ?? []).length, 1);
});

test('keeps each job to its own runs', () => {
  const rows = [line(), line({ module: 'onboard-api', startTime: '2026-10-05T03:00:00Z' })];
  assert.doesNotMatch(section(page(rows), 'm-0-0-0'), /2026-10-05/);
  assert.match(section(page(rows), 'm-0-0-1'), /2026-10-05/);
});

test('shows a run where every test was skipped in grey with no rate', () => {
  const rows = [line({ passed: 0, failed: 0, skipped: 5, flaky: 0 })];
  assert.match(section(page(rows), 'm-0-0-0'), /<li class="day ran no-rate"><a [^>]*title="2026-10-09: 0 passed, 0 failed, 5 skipped, 0 flaky"><b>9<\/b><span>—<\/span><\/a><\/li>/);
});

test('drops a run link that is not a GitHub https address but still shows the day', () => {
  const html = section(page([line({ runUrl: 'javascript:alert(1)' })]), 'm-0-0-0');
  assert.doesNotMatch(html, /javascript:|<a href/);
  assert.match(html, /<li class="day ran" style="--pass:0\.8333"><span class="cell" title="2026-10-09:[^"]*"><b>9<\/b><span>83\.3%<\/span><\/span><\/li>/);
});

test('ignores a damaged history line and a run-failed line', () => {
  const rows = [{ repo: 'lockbox-api-automation', module: 'merchant-api', status: 'run-failed' }, { nonsense: true }, line()];
  assert.equal((section(page(rows), 'm-0-0-0').match(/class="day ran/g) ?? []).length, 1);
});

test('links back to the dashboard', () => {
  assert.match(page(), /<a href="dashboard\.html">Back to dashboard<\/a>/);
});

test('explains the colors and that days are UTC', () => {
  assert.match(page(), /Each day shows the newest run that started on it, in UTC\./);
});

test('escapes names that come from the config', () => {
  const html = page([], dashboard(['<script>alert(1)</script>'], '<b>'));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt; \/ lockbox-api-automation/);
});

test('is one self-contained file with no scripts and no outside resources', () => {
  assert.doesNotMatch(page(), /<script|<link|src=|@import|url\(/);
});
