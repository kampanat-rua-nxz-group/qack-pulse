import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Collected } from '../src/collect.ts';
import { appendHistory, readHistory } from '../src/history.ts';

const URL_ = 'https://github.com/nxz-group/lockbox-api-automation/actions/runs/102';
const stats = { counts: { total: 5, passed: 4, failed: 1, skipped: 0, flaky: 0 }, durationMs: 1000, startTime: '2026-10-12T03:35:00.000Z' };
const source = (attempt: number, names: string[]) => ({
  runId: 102,
  attempt,
  workflow: 'regression.yaml',
  event: 'schedule',
  artifacts: names.map((name) => ({ name, stats })),
});

const okModule = (attempt: number, names: string[]) => ({
  name: 'merchant-api',
  status: 'ok' as const,
  counts: stats.counts,
  durationMs: 1000,
  startTime: stats.startTime,
  stale: false,
  runUrl: URL_,
  source: source(attempt, names),
});

const collectedOf = (modules: Collected['products'][0]['repos'][0]['modules']): Collected => ({
  products: [{ name: 'Lockbox', repos: [{ name: 'lockbox-api-automation', modules }] }],
});

const pathIn = () => join(mkdtempSync(join(tmpdir(), 'qack-pulse-test-')), 'data', 'history.jsonl');
const linesOf = (path: string) => readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

test('writes one line per artifact with counts, names, dates, and the run link only', async () => {
  const path = pathIn();
  assert.equal(await appendHistory(path, collectedOf([okModule(1, ['a-shard1', 'a-shard2'])])), 2);
  const [first] = linesOf(path);
  assert.deepEqual(first, {
    schemaVersion: 1,
    repo: 'lockbox-api-automation',
    module: 'merchant-api',
    runId: 102,
    attempt: 1,
    artifact: 'a-shard1',
    workflow: 'regression.yaml',
    event: 'schedule',
    startTime: '2026-10-12T03:35:00.000Z',
    durationMs: 1000,
    passed: 4,
    failed: 1,
    skipped: 0,
    flaky: 0,
    runUrl: URL_,
  });
});

test('does not duplicate a line when the same results are appended again', async () => {
  const path = pathIn();
  const collected = collectedOf([okModule(1, ['a'])]);
  await appendHistory(path, collected);
  assert.equal(await appendHistory(path, collected), 0);
  assert.equal(linesOf(path).length, 1);
});

test('adds a line for a new attempt of the same run', async () => {
  const path = pathIn();
  await appendHistory(path, collectedOf([okModule(1, ['a'])]));
  assert.equal(await appendHistory(path, collectedOf([okModule(2, ['a'])])), 1);
  assert.deepEqual(linesOf(path).map((line) => line.attempt), [1, 2]);
});

test('writes a run-failed line with no counts, once per module', async () => {
  const path = pathIn();
  const failed = (name: string) => ({
    name,
    status: 'run-failed' as const,
    reason: 'artifact-missing' as const,
    runDate: '2026-10-12T03:33:42Z',
    stale: false,
    runUrl: URL_,
    source: source(1, []),
  });
  const collected = collectedOf([failed('onboard-api'), failed('merchant-api')]);
  assert.equal(await appendHistory(path, collected), 2);
  assert.equal(await appendHistory(path, collected), 0);
  const [line] = linesOf(path);
  assert.equal(line.status, 'run-failed');
  assert.equal('passed' in line, false);
});

test('writes nothing for no-data modules and creates no file', async () => {
  const path = pathIn();
  const noData = { name: 'e2e', status: 'no-data' as const, reason: 'no-run' as const, runDate: null, stale: false, runUrl: null };
  assert.equal(await appendHistory(path, collectedOf([noData])), 0);
  assert.equal(existsSync(path), false);
});

test('readHistory returns every line that parses to an object and skips the rest', async () => {
  const path = pathIn();
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ runId: 1 })}\nnot json\n\n5\n[1]\n${JSON.stringify({ runId: 2 })}\n`);
  assert.deepEqual(await readHistory(path), [{ runId: 1 }, { runId: 2 }]);
});

test('readHistory returns an empty list when the file does not exist', async () => {
  assert.deepEqual(await readHistory(pathIn()), []);
});

test('readHistory reads back what appendHistory wrote', async () => {
  const path = pathIn();
  await appendHistory(path, collectedOf([okModule(1, ['a', 'b'])]));
  const lines = await readHistory(path);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].artifact, 'a');
});
