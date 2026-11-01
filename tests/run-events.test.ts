import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backfill } from '../src/backfill.ts';
import { loadConfig } from '../src/config.ts';
import { selectArtifacts, selectRun } from '../src/select.ts';
import { ARTIFACT, RUN, fakeGh } from './helpers.ts';

test('configured UI modules match the regression workflow domain artifacts', () => {
  const config = loadConfig(new URL('../dashboard.config.json', import.meta.url).pathname);
  const repo = config.products[0].repos.find((item) => item.name === 'lockbox-ui-automation')!;
  const domains = ['allClient', 'merchantProfile', 'transactionDetail', 'allTransactions', 'login', 'overview', 'setPassword'];
  const artifacts = domains.map((domain, id) => ({ ...ARTIFACT, id, name: `report-${domain}-102-418-1` }));
  assert.equal(repo.modules.length, domains.length);
  const matched = repo.modules.map((mod) => {
    assert.equal(mod.workflow, 'regression-tests.yml');
    const pick = selectArtifacts(artifacts, mod.artifactPrefix);
    assert.ok('artifacts' in pick, `${mod.name} has no matching artifact`);
    assert.equal(pick.artifacts.length, 1);
    return pick.artifacts[0].name;
  });
  assert.deepEqual(new Set(matched), new Set(artifacts.map((artifact) => artifact.name)));
});

test('configured modules select the newest completed run regardless of trigger', () => {
  const config = loadConfig(new URL('../dashboard.config.json', import.meta.url).pathname);
  for (const event of ['workflow_dispatch', 'push']) {
    const newest = { ...RUN, id: 103, event, createdAt: '2026-10-13T03:33:42Z' };
    for (const product of config.products) for (const repo of product.repos) for (const mod of repo.modules) {
      assert.equal(selectRun([RUN, newest], mod.events)?.id, 103, `${repo.name}/${mod.name}: ${event}`);
    }
  }
});

test('backfill saves manual and push runs for a configured UI module', async () => {
  const config = loadConfig(new URL('../dashboard.config.json', import.meta.url).pathname);
  const repo = config.products[0].repos.find((item) => item.name === 'lockbox-ui-automation')!;
  config.products[0].repos = [{ ...repo, modules: [repo.modules[0]] }];
  const manual = { ...RUN, id: 103, event: 'workflow_dispatch' };
  const push = { ...RUN, id: 104, event: 'push' };
  const gh = fakeGh({
    listRuns: async () => [manual, push],
    listArtifacts: async (_repo, runId) => [{ ...ARTIFACT, name: `${repo.modules[0].artifactPrefix}${runId}-418-1` }],
  });
  const path = join(mkdtempSync(join(tmpdir(), 'qack-events-')), 'history.jsonl');
  assert.equal(await backfill(config, gh, path), 2);
  const lines = readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((line) => line.event).sort(), ['push', 'workflow_dispatch']);
});
