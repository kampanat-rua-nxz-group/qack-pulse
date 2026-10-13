import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Collected } from '../src/collect.ts';
import { rollup } from '../src/rollup.ts';
import type { Counts } from '../src/stats.ts';

const NOW = new Date('2026-10-12T04:00:00Z');

const SOURCE = { runId: 102, attempt: 1, workflow: 'regression.yaml', event: 'schedule', artifacts: [] };

const ok = (name: string, counts: Counts) => ({
  name,
  status: 'ok' as const,
  counts,
  durationMs: 1000,
  startTime: '2026-10-12T03:35:35.439Z',
  stale: false,
  runUrl: 'https://github.com/nxz-group/lockbox-api-automation/actions/runs/102',
  source: SOURCE,
});

const collected: Collected = {
  products: [
    {
      name: 'Lockbox',
      repos: [
        {
          name: 'lockbox-api-automation',
          modules: [
            ok('merchant-api', { total: 10, passed: 7, failed: 1, skipped: 1, flaky: 1 }),
            ok('onboard-api', { total: 5, passed: 5, failed: 0, skipped: 0, flaky: 0 }),
          ],
        },
        {
          name: 'lockbox-bo-api-automation',
          modules: [ok('report-api', { total: 4, passed: 2, failed: 2, skipped: 0, flaky: 0 })],
        },
      ],
    },
  ],
};

test('stamps the schema version and the generation time', () => {
  const dashboard = rollup(collected, NOW);
  assert.equal(dashboard.schemaVersion, 1);
  assert.equal(dashboard.generatedAt, '2026-10-12T04:00:00.000Z');
});

test('sums modules into their repo and repos into the product', () => {
  const [product] = rollup(collected, NOW).products;
  assert.deepEqual(product.repos[0].counts, { total: 15, passed: 12, failed: 1, skipped: 1, flaky: 1 });
  assert.deepEqual(product.repos[1].counts, { total: 4, passed: 2, failed: 2, skipped: 0, flaky: 0 });
  assert.deepEqual(product.counts, { total: 19, passed: 14, failed: 3, skipped: 1, flaky: 1 });
});

test('keeps every module row under its repo', () => {
  const [product] = rollup(collected, NOW).products;
  assert.deepEqual(product.repos[0].modules.map((module) => module.name), ['merchant-api', 'onboard-api']);
});

const noData = (name: string) => ({
  name,
  status: 'no-data' as const,
  reason: 'artifact-expired' as const,
  runDate: '2025-10-02T05:56:11Z',
  stale: true,
  runUrl: null,
});

const withGaps: Collected = {
  products: [
    {
      name: 'Lockbox',
      repos: [
        {
          name: 'lockbox-api-automation',
          modules: [ok('merchant-api', { total: 10, passed: 7, failed: 1, skipped: 1, flaky: 1 }), noData('e2e')],
        },
        { name: 'lockbox-ui-automation', modules: [noData('backoffice-ui')] },
      ],
    },
  ],
};

test('leaves a module without data out of the sums', () => {
  const [product] = rollup(withGaps, NOW).products;
  assert.deepEqual(product.repos[0].counts, { total: 10, passed: 7, failed: 1, skipped: 1, flaky: 1 });
  assert.deepEqual(product.repos[1].counts, { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 });
  assert.deepEqual(product.counts, { total: 10, passed: 7, failed: 1, skipped: 1, flaky: 1 });
});

test('counts how many modules reported at the repo and product level', () => {
  const [product] = rollup(withGaps, NOW).products;
  assert.deepEqual([product.repos[0].modulesReporting, product.repos[0].modulesTotal], [1, 2]);
  assert.deepEqual([product.repos[1].modulesReporting, product.repos[1].modulesTotal], [0, 1]);
  assert.deepEqual([product.modulesReporting, product.modulesTotal], [1, 3]);
});

test('adds the pass rate and unhealthy rate to each module that has data', () => {
  const [merchant, e2e] = rollup(withGaps, NOW).products[0].repos[0].modules;
  assert.equal(merchant.status === 'ok' && merchant.passRate, 7 / 9);
  assert.equal(merchant.status === 'ok' && merchant.unhealthyRate, 2 / 9);
  assert.equal('passRate' in e2e, false);
});

test('computes repo and product rates from summed counts, not from averaged rates', () => {
  const [product] = rollup(collected, NOW).products;
  // merchant-api 7 of 9 and onboard-api 5 of 5 sum to 12 of 14. The average of the two rates would be 0.889.
  assert.equal(product.repos[0].passRate, 12 / 14);
  assert.equal(product.repos[0].unhealthyRate, 2 / 14);
  assert.equal(product.passRate, 14 / 18);
});

test('gives no rate to a repo or product where no module reported', () => {
  const [product] = rollup({ products: [{ name: 'Lockbox', repos: [{ name: 'lockbox-ui-automation', modules: [noData('backoffice-ui')] }] }] }, NOW).products;
  assert.equal(product.repos[0].passRate, null);
  assert.equal(product.passRate, null);
  assert.equal(product.unhealthyRate, null);
});

test('orders the fields the way dashboard.json documents them', () => {
  const [product] = rollup(withGaps, NOW).products;
  assert.deepEqual(Object.keys(product), ['name', 'counts', 'passRate', 'unhealthyRate', 'modulesReporting', 'modulesTotal', 'modulesFailed', 'repos']);
  assert.deepEqual(Object.keys(product.repos[0].modules[0]), [
    'name', 'status', 'counts', 'passRate', 'unhealthyRate', 'durationMs', 'startTime', 'stale', 'runUrl',
  ]);
  assert.deepEqual(Object.keys(product.repos[0].modules[1]), ['name', 'status', 'reason', 'runDate', 'stale', 'runUrl']);
});

const runFailed = (name: string) => ({
  name,
  status: 'run-failed' as const,
  reason: 'artifact-missing' as const,
  runDate: '2026-10-12T03:33:42Z',
  stale: false,
  runUrl: 'https://github.com/nxz-group/lockbox-api-automation/actions/runs/102',
  source: SOURCE,
});

const withFailure: Collected = {
  products: [
    {
      name: 'Lockbox',
      repos: [
        {
          name: 'lockbox-api-automation',
          modules: [ok('merchant-api', { total: 10, passed: 10, failed: 0, skipped: 0, flaky: 0 }), runFailed('onboard-api')],
        },
        { name: 'lockbox-bo-api-automation', modules: [runFailed('report-api')] },
      ],
    },
  ],
};

test('counts a run-failed module in modulesFailed, not in modulesReporting, and does not sum it', () => {
  const [product] = rollup(withFailure, NOW).products;
  assert.deepEqual([product.repos[0].modulesReporting, product.repos[0].modulesTotal, product.repos[0].modulesFailed], [1, 2, 1]);
  assert.deepEqual([product.repos[1].modulesReporting, product.repos[1].modulesFailed], [0, 1]);
  assert.deepEqual([product.modulesReporting, product.modulesTotal, product.modulesFailed], [1, 3, 2]);
  assert.deepEqual(product.counts, { total: 10, passed: 10, failed: 0, skipped: 0, flaky: 0 });
});

test('gives a run-failed module row null counts, rates, and duration and drops the source', () => {
  const failed = rollup(withFailure, NOW).products[0].repos[0].modules[1];
  assert.deepEqual(failed, {
    name: 'onboard-api',
    status: 'run-failed',
    reason: 'artifact-missing',
    counts: null,
    passRate: null,
    unhealthyRate: null,
    durationMs: null,
    runDate: '2026-10-12T03:33:42Z',
    stale: false,
    runUrl: 'https://github.com/nxz-group/lockbox-api-automation/actions/runs/102',
  });
  assert.equal('source' in rollup(withFailure, NOW).products[0].repos[0].modules[0], false);
});
