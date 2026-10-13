import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backfill } from '../src/backfill.ts';
import { ARTIFACT, RUN, fakeGh, fixture, oneModuleConfig } from './helpers.ts';

const pathIn = () => join(mkdtempSync(join(tmpdir(), 'qack-pulse-test-')), 'data', 'history.jsonl');
const linesOf = (path: string) => readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const older = { ...RUN, id: 101, createdAt: '2026-10-11T03:33:42Z', url: RUN.url.replace('102', '101') };
const art = (runId: number, attempt = 1) => ({ ...ARTIFACT, name: `report-merchant-${runId}-418-${attempt}` });

test('writes a line for every finished run, not only the newest', async () => {
  const path = pathIn();
  const gh = fakeGh({
    listRuns: async () => [RUN, older],
    listArtifacts: async (_repo, runId) => [art(runId)],
  });
  assert.equal(await backfill(oneModuleConfig(), gh, path), 2);
  assert.deepEqual(linesOf(path).map((line) => line.runId).sort(), [101, 102]);
});

test('skips unfinished runs, runs outside the module events, and other artifact prefixes', async () => {
  const path = pathIn();
  const config = oneModuleConfig();
  config.products[0].repos[0].modules[0].events = ['schedule'];
  const gh = fakeGh({
    listRuns: async () => [
      { ...RUN, id: 1, conclusion: '' },
      { ...RUN, id: 2, event: 'push' },
      { ...RUN, id: 3 },
    ],
    listArtifacts: async (_repo, runId) => [art(runId), { ...art(runId), name: `other-${runId}` }],
  });
  assert.equal(await backfill(config, gh, path), 1);
  assert.equal(linesOf(path)[0].runId, 3);
});

test('skips expired artifacts and artifacts without usable stats', async () => {
  const path = pathIn();
  const gh = fakeGh({
    listRuns: async () => [RUN, older],
    listArtifacts: async (_repo, runId) => [{ ...art(runId), expired: runId === 102 }],
    downloadStats: async () => null,
  });
  assert.equal(await backfill(oneModuleConfig(), gh, path), 0);
});

test('keeps each attempt of a re-run as its own line', async () => {
  const path = pathIn();
  const gh = fakeGh({ listArtifacts: async () => [art(102, 1), art(102, 2)] });
  assert.equal(await backfill(oneModuleConfig(), gh, path), 2);
  assert.deepEqual(linesOf(path).map((line) => line.attempt).sort(), [1, 2]);
});

test('does not duplicate lines when run again', async () => {
  const path = pathIn();
  const gh = fakeGh();
  await backfill(oneModuleConfig(), gh, path);
  assert.equal(await backfill(oneModuleConfig(), gh, path), 0);
  assert.equal(linesOf(path).length, 1);
});

test('warns and continues when one module fails', async () => {
  const path = pathIn();
  const config = oneModuleConfig();
  config.products[0].repos[0].modules.push({ name: 'onboard-api', workflow: 'other.yaml', artifactPrefix: 'report-merchant-' });
  const warnings: string[] = [];
  const gh = fakeGh({
    listRuns: async (_repo, workflow) => {
      if (workflow === 'regression.yaml') throw new Error('boom');
      return [RUN];
    },
  });
  assert.equal(await backfill(config, gh, path, (message) => warnings.push(message)), 1);
  assert.match(warnings[0], /merchant-api: boom/);
  assert.equal(linesOf(path)[0].module, 'onboard-api');
});

test('writes only counts, names, dates, and links', async () => {
  const path = pathIn();
  await backfill(oneModuleConfig(), fakeGh(), path);
  const [line] = linesOf(path);
  assert.equal(line.passed, fixture('test-results.json').stats.expected);
  assert.equal(JSON.stringify(line).includes('title'), false);
});
