import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectArtifacts, selectRun } from '../src/select.ts';
import type { Artifact, Run } from '../src/select.ts';

const run = (id: number, conclusion: string, event: string, createdAt: string): Run => ({
  id,
  attempt: 1,
  conclusion,
  event,
  createdAt,
  url: `https://github.com/nxz-group/lockbox-api-automation/actions/runs/${id}`,
});

const runs: Run[] = [
  run(101, 'success', 'schedule', '2026-10-08T03:24:31Z'),
  run(104, '', 'schedule', '2026-10-12T05:00:00Z'),
  run(103, 'cancelled', 'push', '2026-10-12T04:00:00Z'),
  run(102, 'failure', 'workflow_dispatch', '2026-10-12T03:33:42Z'),
];

const artifact = (id: number, name: string, expired: boolean, createdAt: string): Artifact => ({
  id,
  name,
  expired,
  createdAt,
});

test('picks the newest run that finished as success or failure', () => {
  assert.equal(selectRun(runs)?.id, 102);
});

test('ignores runs whose trigger is not in the allowed events', () => {
  assert.equal(selectRun(runs, ['schedule'])?.id, 101);
});

test('returns null when no run qualifies', () => {
  assert.equal(selectRun(runs, ['pull_request']), null);
  assert.equal(selectRun([]), null);
});

test('picks every artifact of the newest attempt, so a re-run wins and shards stay together', () => {
  const pick = selectArtifacts(
    [
      artifact(1, 'report-merchant-102-418-1', false, '2026-10-12T03:35:52Z'),
      artifact(2, 'report-merchant-102-418-2', false, '2026-10-12T04:10:00Z'),
      artifact(4, 'report-merchant-102-418-2-shard2', false, '2026-10-12T04:11:00Z'),
      artifact(3, 'report-onboard-102-418-1', false, '2026-10-12T04:30:00Z'),
    ],
    'report-merchant-',
  );
  assert.deepEqual(pick, {
    artifacts: [
      artifact(2, 'report-merchant-102-418-2', false, '2026-10-12T04:10:00Z'),
      artifact(4, 'report-merchant-102-418-2-shard2', false, '2026-10-12T04:11:00Z'),
    ],
  });
});

test('skips expired artifacts when others of the module are live', () => {
  const live = artifact(2, 'playwright-report-102-418-1-b', false, '2026-10-12T03:36:00Z');
  const pick = selectArtifacts([artifact(1, 'playwright-report-102-418-1-a', true, '2026-10-12T03:35:00Z'), live], 'playwright-report-');
  assert.deepEqual(pick, { artifacts: [live] });
});

test('reports artifact-missing when no artifact has the prefix', () => {
  const pick = selectArtifacts([artifact(3, 'report-onboard-102-418-1', false, '2026-10-12T04:30:00Z')], 'report-merchant-');
  assert.deepEqual(pick, { reason: 'artifact-missing' });
});

test('reports artifact-expired when every matching artifact is expired', () => {
  const pick = selectArtifacts([artifact(1, 'report-merchant-102-418-1', true, '2026-10-12T03:35:52Z')], 'report-merchant-');
  assert.deepEqual(pick, { reason: 'artifact-expired' });
});
