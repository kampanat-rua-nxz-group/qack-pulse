import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rates } from '../src/health.ts';

test('divides by executed tests, which is total minus skipped', () => {
  const result = rates({ total: 100, passed: 80, failed: 10, skipped: 4, flaky: 6 });
  assert.equal(result.passRate, 80 / 96);
  assert.equal(result.unhealthyRate, 16 / 96);
});

test('counts a flaky test as unhealthy, not as passed', () => {
  assert.deepEqual(rates({ total: 4, passed: 3, failed: 0, skipped: 0, flaky: 1 }), { passRate: 0.75, unhealthyRate: 0.25 });
});

test('gives 1 and 0 when every executed test passed', () => {
  assert.deepEqual(rates({ total: 135, passed: 124, failed: 0, skipped: 11, flaky: 0 }), { passRate: 1, unhealthyRate: 0 });
});

test('gives no rate when every test is skipped', () => {
  assert.deepEqual(rates({ total: 179, passed: 0, failed: 0, skipped: 179, flaky: 0 }), { passRate: null, unhealthyRate: null });
});

test('gives no rate when there are no tests', () => {
  assert.deepEqual(rates({ total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 }), { passRate: null, unhealthyRate: null });
});
