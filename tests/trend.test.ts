import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HistoryLine } from '../src/history.ts';
import { buildTrend, TREND_DAYS } from '../src/trend.ts';
import type { Trend } from '../src/trend.ts';

const NOW = new Date('2026-10-12T04:00:00Z');
const hierarchy = { products: [{ name: 'Lockbox', repos: [{ name: 'repo-a', modules: [{ name: 'mod-a' }, { name: 'mod-b' }] }] }] };
const URL_ = 'https://github.com/nxz-group/repo-a/actions/runs/1';

let nextRun = 1;
const row = (over: HistoryLine = {}): HistoryLine => ({
  schemaVersion: 1,
  repo: 'repo-a',
  module: 'mod-a',
  runId: nextRun++,
  attempt: 1,
  artifact: 'a',
  workflow: 'regression.yaml',
  event: 'schedule',
  startTime: '2026-10-12T03:00:00.000Z',
  durationMs: 1000,
  passed: 9,
  failed: 1,
  skipped: 0,
  flaky: 0,
  runUrl: URL_,
  ...over,
});
const day = (date: string, over: HistoryLine = {}): HistoryLine => row({ startTime: `${date}T03:00:00.000Z`, ...over });

const built = (rows: HistoryLine[]) => buildTrend(rows, hierarchy, NOW);
const modA = (rows: HistoryLine[]): Trend => built(rows).products[0].repos[0].modules[0].trend;
const at = (trend: Trend, date: string) => trend.points.find((point) => point.date === date);

const stable = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((date) => day(date, { passed: 10, failed: 0 }));

test('the window is 14 UTC days ending on the day of now, oldest first', () => {
  const { points } = modA([]);
  assert.equal(TREND_DAYS, 14);
  assert.equal(points.length, 14);
  assert.equal(points[0].date, '2026-09-29');
  assert.equal(points[13].date, '2026-10-12');
});

test('mirrors the product, repo, and module names', () => {
  const trend = built([]);
  assert.equal(trend.days, 14);
  assert.deepEqual(trend.products.map((p) => p.name), ['Lockbox']);
  assert.deepEqual(trend.products[0].repos.map((r) => r.name), ['repo-a']);
  assert.deepEqual(trend.products[0].repos[0].modules.map((m) => m.name), ['mod-a', 'mod-b']);
});

test('with no history every point is empty and the direction is unknown', () => {
  const trend = modA([]);
  assert.equal(trend.points.every((point) => point.counts === null && point.passRate === null), true);
  assert.equal(trend.direction, 'unknown');
  assert.equal(trend.delta, null);
});

test('a day with no run is a gap', () => {
  const trend = modA([day('2026-10-11')]);
  assert.equal(at(trend, '2026-10-10')?.counts, null);
  assert.equal(at(trend, '2026-10-10')?.passRate, null);
  assert.equal(at(trend, '2026-10-11')?.passRate, 0.9);
});

test('uses the newest run of the day', () => {
  const trend = modA([
    row({ startTime: '2026-10-11T01:00:00.000Z', passed: 5, failed: 5 }),
    row({ startTime: '2026-10-11T09:00:00.000Z', passed: 10, failed: 0 }),
  ]);
  assert.equal(at(trend, '2026-10-11')?.counts?.passed, 10);
  assert.equal(at(trend, '2026-10-11')?.passRate, 1);
});

test('the shards of one run add up', () => {
  const trend = modA([row({ runId: 500, artifact: 'a-1' }), row({ runId: 500, artifact: 'a-2' })]);
  assert.deepEqual(at(trend, '2026-10-12')?.counts, { total: 20, passed: 18, failed: 2, skipped: 0, flaky: 0 });
  assert.equal(at(trend, '2026-10-12')?.passRate, 0.9);
});

test('a run-failed line has no counts and leaves the day empty', () => {
  const failed = { schemaVersion: 1, repo: 'repo-a', module: 'mod-a', runId: 9, attempt: 1, status: 'run-failed', workflow: 'regression.yaml', event: 'schedule', runUrl: URL_ };
  assert.equal(at(modA([failed]), '2026-10-12')?.counts, null);
});

test('a module with every test skipped has counts but no pass rate', () => {
  const point = at(modA([row({ passed: 0, failed: 0, skipped: 5 })]), '2026-10-12');
  assert.equal(point?.counts?.skipped, 5);
  assert.equal(point?.passRate, null);
});

test('ignores modules not in the hierarchy and rows with a future date', () => {
  const trend = modA([row({ module: 'gone' }), day('2026-10-20')]);
  assert.equal(trend.points.every((point) => point.counts === null), true);
  assert.equal(trend.points.at(-1)?.date, '2026-10-12');
});

test('a run older than the window leaves the module series empty', () => {
  assert.equal(modA([day('2026-09-01')]).points.every((point) => point.counts === null), true);
});

test('skips malformed lines without throwing', () => {
  const trend = modA([
    row({ passed: '9' }),
    row({ startTime: 'nonsense' }),
    row({ startTime: undefined }),
    row({ failed: -1 }),
    row({ repo: 7 }),
  ]);
  assert.equal(trend.points.every((point) => point.counts === null), true);
});

test('reads worse when the latest pass rate is below the mean of the earlier points', () => {
  const trend = modA([...stable, day('2026-10-12', { passed: 8, failed: 2 })]);
  assert.equal(trend.direction, 'worse');
  assert.ok(Math.abs((trend.delta ?? 0) + 0.2) < 1e-9);
});

test('reads better when the latest pass rate is above the mean of the earlier points', () => {
  const lower = stable.map((line) => ({ ...line, passed: 8, failed: 2 }));
  const trend = modA([...lower, day('2026-10-12', { passed: 10, failed: 0 })]);
  assert.equal(trend.direction, 'better');
  assert.ok(Math.abs((trend.delta ?? 0) - 0.2) < 1e-9);
});

test('reads flat when the change is 1 percentage point or less', () => {
  const trend = modA([...stable, day('2026-10-12', { passed: 199, failed: 1 })]);
  assert.equal(trend.direction, 'flat');
});

test('says unknown with fewer than 3 pass rates', () => {
  const trend = modA([day('2026-10-11'), day('2026-10-12')]);
  assert.equal(trend.direction, 'unknown');
  assert.equal(trend.delta, null);
});

test('repo and product series carry each module forward from its last run', () => {
  const result = built([
    day('2026-10-10', { passed: 10, failed: 0 }),
    day('2026-10-11', { module: 'mod-b', passed: 5, failed: 5 }),
  ]);
  const repo = result.products[0].repos[0].trend;
  assert.equal(at(repo, '2026-10-09')?.counts, null);
  assert.equal(at(repo, '2026-10-10')?.passRate, 1);
  assert.equal(at(repo, '2026-10-11')?.passRate, 0.75);
  assert.equal(at(repo, '2026-10-12')?.passRate, 0.75);
  assert.deepEqual(result.products[0].trend.points, repo.points);
  assert.equal(at(result.products[0].repos[0].modules[1].trend, '2026-10-12')?.counts, null);
});
