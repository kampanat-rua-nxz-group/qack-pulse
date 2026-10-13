import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkGh, createGh } from '../src/gh.ts';
import type { Exec } from '../src/gh.ts';
import { REPO, fixtureText } from './helpers.ts';

// Records every call and answers with the given handler.
const recorder = (handler: (args: string[]) => Promise<string> | string) => {
  const calls: string[][] = [];
  const exec: Exec = async (args) => {
    calls.push(args);
    return handler(args);
  };
  return { calls, exec };
};

const dirFrom = (args: string[]): string => args[args.indexOf('--dir') + 1];

const writeReport = async (args: string[], content: string): Promise<string> => {
  await mkdir(join(dirFrom(args), 'test-results'), { recursive: true });
  await writeFile(join(dirFrom(args), 'test-results', 'test-results.json'), content);
  return '';
};

test('listRuns asks gh for the branch runs of one workflow and maps the fields', async () => {
  const { calls, exec } = recorder(() => fixtureText('runs.json'));
  const runs = await createGh('main', exec).listRuns(REPO, 'regression.yaml');
  assert.deepEqual(calls[0], [
    'run', 'list',
    '--repo', REPO,
    '--workflow', 'regression.yaml',
    '--branch', 'main',
    '--limit', '50',
    '--json', 'databaseId,attempt,conclusion,event,createdAt,url',
  ]);
  assert.deepEqual(runs[1], {
    id: 102,
    attempt: 1,
    conclusion: 'success',
    event: 'schedule',
    createdAt: '2026-10-12T03:33:42Z',
    url: `https://github.com/${REPO}/actions/runs/102`,
  });
});

test('listArtifacts reads the run artifacts and maps the fields', async () => {
  const { calls, exec } = recorder(() => fixtureText('artifacts.json'));
  const artifacts = await createGh('main', exec).listArtifacts(REPO, 102);
  assert.deepEqual(calls[0], ['api', `repos/${REPO}/actions/runs/102/artifacts?per_page=100`]);
  assert.deepEqual(artifacts, [
    { id: 9001, name: 'report-merchant-102-418-1', expired: false, createdAt: '2026-10-12T03:35:52Z' },
    { id: 9003, name: 'report-onboard-102-418-1', expired: true, createdAt: '2026-10-12T03:36:43Z' },
  ]);
});

test('downloadStats returns the stats block and deletes the temporary folder', async () => {
  const { calls, exec } = recorder((args) => writeReport(args, fixtureText('test-results.json')));
  const stats = await createGh('main', exec).downloadStats(REPO, 102, 'report-merchant-102-418-1');
  assert.deepEqual(calls[0].slice(0, 7), ['run', 'download', '102', '--repo', REPO, '--name', 'report-merchant-102-418-1']);
  assert.deepEqual(stats, JSON.parse(fixtureText('test-results.json')).stats);
  assert.equal(existsSync(dirFrom(calls[0])), false);
});

test('downloadStats returns null when the report is absent, unreadable, or has no stats', async () => {
  const absent = recorder(() => '');
  assert.equal(await createGh('main', absent.exec).downloadStats(REPO, 102, 'a'), null);
  const broken = recorder((args) => writeReport(args, '{ not json'));
  assert.equal(await createGh('main', broken.exec).downloadStats(REPO, 102, 'a'), null);
  const noStats = recorder((args) => writeReport(args, '{"suites":[]}'));
  assert.equal(await createGh('main', noStats.exec).downloadStats(REPO, 102, 'a'), null);
});

test('downloadStats fails when the download fails and still deletes the temporary folder', async () => {
  const { calls, exec } = recorder(() => {
    throw new Error('HTTP 502');
  });
  await assert.rejects(createGh('main', exec).downloadStats(REPO, 102, 'a'), /HTTP 502/);
  assert.equal(existsSync(dirFrom(calls[0])), false);
});

test('checkGh passes when gh is installed and logged in', async () => {
  const { calls, exec } = recorder(() => '');
  await checkGh(exec);
  assert.deepEqual(calls, [['--version'], ['auth', 'status']]);
});

test('checkGh explains how to install gh when it is missing', async () => {
  const { exec } = recorder(() => {
    throw new Error('spawn gh ENOENT');
  });
  await assert.rejects(checkGh(exec), /was not found\. Install it with: brew install gh/);
});

test('checkGh explains how to log in when gh has no session', async () => {
  const { exec } = recorder((args) => {
    if (args[0] === 'auth') throw new Error('not logged in');
    return '';
  });
  await assert.rejects(checkGh(exec), /is not logged in\. Run: gh auth login/);
});
