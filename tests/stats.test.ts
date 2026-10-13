import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapStats, mergeStats } from '../src/stats.ts';
import { fixture } from './helpers.ts';

const base = { startTime: '2026-10-12T03:35:35.439Z', duration: 10, expected: 5, skipped: 1, unexpected: 2, flaky: 3 };

test('maps Playwright stats to counts, duration, and start time', () => {
  assert.deepEqual(mapStats(fixture('test-results.json').stats), {
    counts: { total: 135, passed: 124, failed: 0, skipped: 11, flaky: 0 },
    durationMs: 14517,
    startTime: '2026-10-12T03:35:35.439Z',
  });
});

test('counts a flaky test in flaky and total, not in passed', () => {
  assert.deepEqual(mapStats(base)?.counts, { total: 11, passed: 5, failed: 2, skipped: 1, flaky: 3 });
});

test('keeps the counts when duration is missing or unusable', () => {
  const { duration, ...withoutDuration } = base;
  assert.equal(mapStats(withoutDuration)?.durationMs, null);
  assert.equal(mapStats({ ...base, duration: -1 })?.durationMs, null);
  assert.equal(mapStats({ ...base, duration: '10' })?.durationMs, null);
});

const unusable: [string, unknown][] = [
  ['null', null],
  ['text', 'stats'],
  ['a missing count', { ...base, expected: undefined }],
  ['a negative count', { ...base, unexpected: -1 }],
  ['a count given as text', { ...base, skipped: '1' }],
  ['a fractional count', { ...base, flaky: 1.5 }],
  ['a missing start time', { ...base, startTime: undefined }],
  ['an unreadable start time', { ...base, startTime: 'yesterday' }],
];

for (const [label, stats] of unusable) {
  test(`returns null for ${label}`, () => {
    assert.equal(mapStats(stats), null);
  });
}

test('merges shards: counts add, the longest duration wins, the earliest start wins', () => {
  const shard = (passed: number, durationMs: number | null, startTime: string) => ({
    counts: { total: passed + 1, passed, failed: 1, skipped: 0, flaky: 0 },
    durationMs,
    startTime,
  });
  assert.deepEqual(mergeStats([shard(5, 100, '2026-10-12T03:36:00.000Z'), shard(3, 250, '2026-10-12T03:35:00.000Z'), shard(1, null, '2026-10-12T03:37:00.000Z')]), {
    counts: { total: 12, passed: 9, failed: 3, skipped: 0, flaky: 0 },
    durationMs: 250,
    startTime: '2026-10-12T03:35:00.000Z',
  });
  assert.equal(mergeStats([shard(1, null, '2026-10-12T03:35:00.000Z')]).durationMs, null);
});
