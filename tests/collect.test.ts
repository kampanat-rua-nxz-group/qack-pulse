import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect } from '../src/collect.ts';
import { REPO, RUN, fakeGh, oneModuleConfig } from './helpers.ts';

const NOW = new Date('2026-10-12T04:00:00Z');

test('collects the counts of the latest run for a module', async () => {
  const collected = await collect(oneModuleConfig(), fakeGh(), NOW);
  assert.deepEqual(collected, {
    products: [
      {
        name: 'Lockbox',
        repos: [
          {
            name: 'lockbox-api-automation',
            modules: [
              {
                name: 'merchant-api',
                status: 'ok',
                counts: { total: 135, passed: 124, failed: 0, skipped: 11, flaky: 0 },
                durationMs: 14517,
                startTime: '2026-10-12T03:35:35.439Z',
                stale: false,
                runUrl: RUN.url,
                source: {
                  runId: 102,
                  attempt: 1,
                  workflow: 'regression.yaml',
                  event: 'schedule',
                  artifacts: [
                    {
                      name: 'report-merchant-102-418-1',
                      stats: {
                        counts: { total: 135, passed: 124, failed: 0, skipped: 11, flaky: 0 },
                        durationMs: 14517,
                        startTime: '2026-10-12T03:35:35.439Z',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });
});

test('asks gh for the repo as owner/name with the module workflow', async () => {
  const seen: string[] = [];
  const gh = fakeGh({
    listRuns: async (repo, workflow) => {
      seen.push(`${repo} ${workflow}`);
      return [RUN];
    },
  });
  await collect(oneModuleConfig(), gh, NOW);
  assert.deepEqual(seen, [`${REPO} regression.yaml`]);
});

test('marks a module stale when its run is older than the threshold', async () => {
  const sixDaysLater = new Date('2026-10-18T04:00:00Z');
  const [module] = (await collect(oneModuleConfig(), fakeGh(), sixDaysLater)).products[0].repos[0].modules;
  assert.equal(module.status === 'ok' && module.stale, true);
});

test('uses the module stale threshold when it has one', async () => {
  const config = oneModuleConfig();
  const [product] = config.products;
  const [repo] = product.repos;
  const relaxed = {
    ...config,
    products: [{ ...product, repos: [{ ...repo, modules: [{ ...repo.modules[0], staleAfterDays: 8 }] }] }],
  };
  const sixDaysLater = new Date('2026-10-18T04:00:00Z');
  const [module] = (await collect(relaxed, fakeGh(), sixDaysLater)).products[0].repos[0].modules;
  assert.equal(module.status === 'ok' && module.stale, false);
});

const moduleOf = async (gh = fakeGh(), config = oneModuleConfig()) =>
  (await collect(config, gh, NOW)).products[0].repos[0].modules[0];

const failing = async (): Promise<never> => {
  throw new Error('HTTP 502');
};

test('reports no-run when no finished run matches', async () => {
  const module = await moduleOf(fakeGh({ listRuns: async () => [{ ...RUN, conclusion: 'cancelled' }] }));
  assert.deepEqual(module, { name: 'merchant-api', status: 'no-data', reason: 'no-run', runDate: null, stale: false, runUrl: null });
});

test('reports artifact-missing and keeps the date and link of the run', async () => {
  const module = await moduleOf(fakeGh({ listArtifacts: async () => [] }));
  assert.deepEqual(module, {
    name: 'merchant-api',
    status: 'no-data',
    reason: 'artifact-missing',
    runDate: RUN.createdAt,
    stale: false,
    runUrl: RUN.url,
  });
});

test('reports artifact-expired when the matching artifact is past its retention', async () => {
  const expired = { id: 9001, name: 'report-merchant-102-418-1', expired: true, createdAt: '2026-10-12T03:35:52Z' };
  const module = await moduleOf(fakeGh({ listArtifacts: async () => [expired] }));
  assert.equal(module.status === 'no-data' && module.reason, 'artifact-expired');
});

test('reports stats-missing when the report has no usable stats', async () => {
  const absent = await moduleOf(fakeGh({ downloadStats: async () => null }));
  assert.equal(absent.status === 'no-data' && absent.reason, 'stats-missing');
  const wrongTypes = await moduleOf(fakeGh({ downloadStats: async () => ({ expected: '124' }) }));
  assert.equal(wrongTypes.status === 'no-data' && wrongTypes.reason, 'stats-missing');
});

test('reports fetch-failed for each gh call that fails, and passes the cause to warn', async () => {
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
  };
  const config = oneModuleConfig();
  const moduleWith = async (gh: ReturnType<typeof fakeGh>) =>
    (await collect(config, gh, NOW, warn)).products[0].repos[0].modules[0];

  const runsFailed = await moduleWith(fakeGh({ listRuns: failing }));
  assert.deepEqual(runsFailed, { name: 'merchant-api', status: 'no-data', reason: 'fetch-failed', runDate: null, stale: false, runUrl: null });
  const artifactsFailed = await moduleWith(fakeGh({ listArtifacts: failing }));
  assert.equal(artifactsFailed.status === 'no-data' && artifactsFailed.runUrl, RUN.url);
  const downloadFailed = await moduleWith(fakeGh({ downloadStats: failing }));
  assert.equal(downloadFailed.status === 'no-data' && downloadFailed.reason, 'fetch-failed');
  assert.deepEqual(warnings, Array(3).fill(`${REPO} merchant-api: HTTP 502`));
});

// Three modules on one workflow, plus a second repo, as in the real config.
const manyModules = () => {
  const config = oneModuleConfig();
  const [product] = config.products;
  return {
    ...config,
    products: [
      {
        ...product,
        repos: [
          {
            name: 'lockbox-api-automation',
            modules: [
              { name: 'merchant-api', workflow: 'regression.yaml', artifactPrefix: 'report-merchant-' },
              { name: 'onboard-api', workflow: 'regression.yaml', artifactPrefix: 'report-onboard-' },
              { name: 'e2e', workflow: 'e2e.yaml', artifactPrefix: 'playwright-report-', events: ['schedule'] },
            ],
          },
          {
            name: 'lockbox-bo-api-automation',
            modules: [{ name: 'report-api', workflow: 'report-api-regression.yaml', artifactPrefix: 'report-merchant-' }],
          },
        ],
      },
    ],
  };
};

test('one failing repo does not stop the other modules', async () => {
  const gh = fakeGh({
    listRuns: async (repo) => {
      if (repo.endsWith('lockbox-bo-api-automation')) throw new Error('HTTP 502');
      return [RUN];
    },
    listArtifacts: async () => [
      { id: 9001, name: 'report-merchant-102-418-1', expired: false, createdAt: '2026-10-12T03:35:52Z' },
      { id: 9002, name: 'report-onboard-102-418-1', expired: false, createdAt: '2026-10-12T03:36:43Z' },
    ],
  });
  const [api, bo] = (await collect(manyModules(), gh, NOW)).products[0].repos;
  assert.deepEqual(api.modules.map((module) => module.status), ['ok', 'ok', 'no-data']);
  assert.deepEqual(bo.modules.map((module) => module.status === 'no-data' && module.reason), ['fetch-failed']);
});

test('only counts allowed events for a module that lists them', async () => {
  const manual = { ...RUN, id: 200, event: 'workflow_dispatch', createdAt: '2026-10-12T03:50:00Z' };
  const gh = fakeGh({ listRuns: async () => [manual] });
  const [api] = (await collect(manyModules(), gh, NOW)).products[0].repos;
  const e2e = api.modules[2];
  assert.equal(e2e.status === 'no-data' && e2e.reason, 'no-run');
});

test('looks up runs once per workflow and artifacts once per run', async () => {
  const calls = { runs: [] as string[], artifacts: [] as string[] };
  const gh = fakeGh({
    listRuns: async (repo, workflow) => {
      calls.runs.push(`${repo} ${workflow}`);
      return [RUN];
    },
    listArtifacts: async (repo, runId) => {
      calls.artifacts.push(`${repo} ${runId}`);
      return [];
    },
  });
  await collect(manyModules(), gh, NOW);
  assert.deepEqual(calls.runs.sort(), [
    'nxz-group/lockbox-api-automation e2e.yaml',
    'nxz-group/lockbox-api-automation regression.yaml',
    'nxz-group/lockbox-bo-api-automation report-api-regression.yaml',
  ]);
  assert.deepEqual(calls.artifacts.sort(), [
    'nxz-group/lockbox-api-automation 102',
    'nxz-group/lockbox-bo-api-automation 102',
  ]);
});

const failedRun = { ...RUN, conclusion: 'failure' };

test('reports run-failed when the latest run failed and left no artifact', async () => {
  const module = await moduleOf(fakeGh({ listRuns: async () => [failedRun], listArtifacts: async () => [] }));
  assert.deepEqual(module, {
    name: 'merchant-api',
    status: 'run-failed',
    reason: 'artifact-missing',
    runDate: RUN.createdAt,
    stale: false,
    runUrl: RUN.url,
    source: { runId: 102, attempt: 1, workflow: 'regression.yaml', event: 'schedule', artifacts: [] },
  });
});

test('reports run-failed when the latest run failed and its artifact has no stats', async () => {
  const module = await moduleOf(fakeGh({ listRuns: async () => [failedRun], downloadStats: async () => null }));
  assert.equal(module.status === 'run-failed' && module.reason, 'stats-missing');
});

test('keeps no-data for a successful run without results and for an expired artifact of a failed run', async () => {
  const expired = { id: 1, name: 'report-merchant-102-418-1', expired: true, createdAt: '2026-10-12T03:35:52Z' };
  const success = await moduleOf(fakeGh({ downloadStats: async () => null }));
  assert.equal(success.status, 'no-data');
  const old = await moduleOf(fakeGh({ listRuns: async () => [failedRun], listArtifacts: async () => [expired] }));
  assert.equal(old.status === 'no-data' && old.reason, 'artifact-expired');
});

test('flags a no-data or run-failed row stale from the date of its run', async () => {
  const yearLater = new Date('2027-10-12T04:00:00Z');
  const run = async (gh: ReturnType<typeof fakeGh>) => (await collect(oneModuleConfig(), gh, yearLater)).products[0].repos[0].modules[0];
  const noData = await run(fakeGh({ listArtifacts: async () => [] }));
  assert.equal(noData.status === 'no-data' && noData.stale, true);
  const failed = await run(fakeGh({ listRuns: async () => [failedRun], listArtifacts: async () => [] }));
  assert.equal(failed.status === 'run-failed' && failed.stale, true);
});

test('merges the shards of a module into summed counts and the longest duration', async () => {
  const gh = fakeGh({
    listArtifacts: async () => [
      { id: 1, name: 'report-merchant-102-418-1-shard1', expired: false, createdAt: '2026-10-12T03:35:52Z' },
      { id: 2, name: 'report-merchant-102-418-1-shard2', expired: false, createdAt: '2026-10-12T03:35:53Z' },
    ],
    downloadStats: async (_repo, _id, name) => ({
      startTime: name.endsWith('shard1') ? '2026-10-12T03:35:00.000Z' : '2026-10-12T03:36:00.000Z',
      duration: name.endsWith('shard1') ? 1000 : 4000,
      expected: 10,
      unexpected: 1,
      skipped: 0,
      flaky: 0,
    }),
  });
  const module = await moduleOf(gh);
  assert.equal(module.status, 'ok');
  if (module.status !== 'ok') return;
  assert.deepEqual(module.counts, { total: 22, passed: 20, failed: 2, skipped: 0, flaky: 0 });
  assert.equal(module.durationMs, 4000);
  assert.equal(module.startTime, '2026-10-12T03:35:00.000Z');
  assert.equal(module.source.artifacts.length, 2);
});

test('treats one unreadable shard as stats-missing so totals are never understated', async () => {
  const gh = fakeGh({
    listArtifacts: async () => [
      { id: 1, name: 'report-merchant-102-418-1-a', expired: false, createdAt: '2026-10-12T03:35:52Z' },
      { id: 2, name: 'report-merchant-102-418-1-b', expired: false, createdAt: '2026-10-12T03:35:53Z' },
    ],
    downloadStats: async (_repo, _id, name) => (name.endsWith('-a') ? { startTime: '2026-10-12T03:35:00Z', expected: 1, unexpected: 0, skipped: 0, flaky: 0 } : null),
  });
  const module = await moduleOf(gh);
  assert.equal(module.status === 'no-data' && module.reason, 'stats-missing');
});
