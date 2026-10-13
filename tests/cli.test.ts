import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { run } from '../src/cli.ts';
import type { Deps } from '../src/cli.ts';
import { RUN, fakeGh, oneModuleConfig } from './helpers.ts';

// A workspace in a temporary folder with a valid config, a fake gh, and captured output.
const workspace = (overrides: Partial<Deps> = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'qack-pulse-test-'));
  writeFileSync(join(dir, 'dashboard.config.json'), JSON.stringify(oneModuleConfig()));
  const output = { stdout: '', stderr: '', opened: [] as string[] };
  const deps: Deps = {
    configPath: join(dir, 'dashboard.config.json'),
    outDir: join(dir, 'out'),
    historyPath: join(dir, 'data', 'history.jsonl'),
    now: () => new Date('2026-10-12T04:00:00Z'),
    checkGh: async () => {},
    createGh: () => fakeGh(),
    open: async (path) => {
      output.opened.push(path);
    },
    stdout: (text) => {
      output.stdout += text;
    },
    stderr: (text) => {
      output.stderr += text;
    },
    ...overrides,
  };
  return { dir, deps, output };
};

test('writes the dashboard page and reports where it is', async () => {
  const { dir, deps, output } = workspace();
  assert.equal(await run([], deps), 0);
  const html = readFileSync(join(dir, 'out', 'dashboard.html'), 'utf8');
  assert.match(html, /merchant-api/);
  assert.match(html, /<td class="num">135<\/td>/);
  assert.match(output.stdout, /Wrote .*dashboard\.html/);
});

test('writes dashboard.json with the same rolled-up data', async () => {
  const { dir, deps, output } = workspace();
  await run([], deps);
  const json = JSON.parse(readFileSync(join(dir, 'out', 'dashboard.json'), 'utf8'));
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.generatedAt, '2026-10-12T04:00:00.000Z');
  assert.deepEqual(json.products[0].repos[0].modules[0], {
    name: 'merchant-api',
    status: 'ok',
    counts: { total: 135, passed: 124, failed: 0, skipped: 11, flaky: 0 },
    passRate: 1,
    unhealthyRate: 0,
    durationMs: 14517,
    startTime: '2026-10-12T03:35:35.439Z',
    stale: false,
    runUrl: RUN.url,
  });
  assert.equal(json.products[0].modulesReporting, 1);
  assert.match(output.stdout, /Wrote .*dashboard\.json/);
});

test('opens the page in the browser unless --no-open is given', async () => {
  const opening = workspace();
  await run([], opening.deps);
  assert.deepEqual(opening.output.opened, [join(opening.dir, 'out', 'dashboard.html')]);
  const quiet = workspace();
  assert.equal(await run(['--no-open'], quiet.deps), 0);
  assert.deepEqual(quiet.output.opened, []);
});

test('still succeeds when the browser cannot be opened', async () => {
  const { dir, deps, output } = workspace({
    open: async () => {
      throw new Error('no display');
    },
  });
  assert.equal(await run([], deps), 0);
  assert.match(output.stderr, /Warning: could not open the browser: no display/);
  assert.equal(existsSync(join(dir, 'out', 'dashboard.html')), true);
});

test('prints the cause of a failed GitHub request and still writes the page', async () => {
  const { dir, deps, output } = workspace({
    createGh: () =>
      fakeGh({
        listRuns: async () => {
          throw new Error('HTTP 502');
        },
      }),
  });
  assert.equal(await run(['--no-open'], deps), 0);
  assert.match(output.stderr, /Warning: nxz-group\/lockbox-api-automation merchant-api: HTTP 502/);
  assert.match(readFileSync(join(dir, 'out', 'dashboard.html'), 'utf8'), /No data: the GitHub request failed/);
});

test('uses the branch from the config when it creates gh', async () => {
  const branches: string[] = [];
  const { deps } = workspace({
    createGh: (branch) => {
      branches.push(branch);
      return fakeGh();
    },
  });
  await run(['--no-open'], deps);
  assert.deepEqual(branches, ['main']);
});

test('stops with the field name when the config is invalid', async () => {
  const { dir, deps, output } = workspace();
  writeFileSync(deps.configPath, JSON.stringify({ ...oneModuleConfig(), owner: '' }));
  assert.equal(await run([], deps), 1);
  assert.match(output.stderr, /Invalid config: owner must be a non-empty string/);
  assert.equal(existsSync(join(dir, 'out')), false);
});

test('stops before collecting when gh is not ready', async () => {
  let collected = false;
  const { dir, deps, output } = workspace({
    checkGh: async () => {
      throw new Error('GitHub CLI (gh) is not logged in. Run: gh auth login');
    },
    createGh: () => {
      collected = true;
      return fakeGh();
    },
  });
  assert.equal(await run([], deps), 1);
  assert.match(output.stderr, /Run: gh auth login/);
  assert.equal(collected, false);
  assert.equal(existsSync(join(dir, 'out')), false);
});

test('appends to the history file once, even when the script runs twice', async () => {
  const { dir, deps } = workspace();
  await run(['--no-open'], deps);
  await run(['--no-open'], deps);
  const lines = readFileSync(join(dir, 'data', 'history.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).artifact, 'report-merchant-102-418-1');
  assert.equal(existsSync(join(dir, 'out', 'history.jsonl')), false);
});

test('stops with a message when the config asks for the history mode', async () => {
  const { deps, output } = workspace();
  writeFileSync(deps.configPath, JSON.stringify({ ...oneModuleConfig(), mode: 'history' }));
  assert.equal(await run([], deps), 1);
  assert.match(output.stderr, /mode "history" is not available yet/);
});

test('adds a trend block to dashboard.json with dates, rates, and counts only', async () => {
  const { dir, deps } = workspace();
  await run(['--no-open'], deps);
  const json = JSON.parse(readFileSync(join(dir, 'out', 'dashboard.json'), 'utf8'));
  assert.equal(json.trend.days, 14);
  const mod = json.trend.products[0].repos[0].modules[0];
  assert.equal(mod.name, 'merchant-api');
  assert.equal(mod.trend.points.length, 14);
  assert.deepEqual(mod.trend.points[13], { date: '2026-10-12', counts: { total: 135, passed: 124, failed: 0, skipped: 11, flaky: 0 }, passRate: 1 });
  assert.equal(mod.trend.direction, 'unknown');
});

test('the page shows the trend cards using history from earlier runs', async () => {
  const { dir, deps } = workspace();
  mkdirSync(join(dir, 'data'), { recursive: true });
  const earlier = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((date, index) =>
    JSON.stringify({
      schemaVersion: 1,
      repo: 'lockbox-api-automation',
      module: 'merchant-api',
      runId: 1 + index,
      attempt: 1,
      artifact: `old-${index}`,
      workflow: 'regression.yaml',
      event: 'schedule',
      startTime: `${date}T03:00:00.000Z`,
      durationMs: 1000,
      passed: 100,
      failed: 0,
      skipped: 0,
      flaky: 0,
      runUrl: 'https://github.com/nxz-group/lockbox-api-automation/actions/runs/1',
    }),
  );
  writeFileSync(deps.historyPath, `${earlier.join('\n')}\n`);
  await run(['--no-open'], deps);
  const html = readFileSync(join(dir, 'out', 'dashboard.html'), 'utf8');
  assert.match(html, /class="trends"/);
  assert.match(html, /<svg class="spark"/);
  assert.match(html, /<span class="delta">flat<\/span>/);
});

test('still writes the page when the history file has a damaged line', async () => {
  const { dir, deps } = workspace();
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(deps.historyPath, 'not json\n');
  assert.equal(await run(['--no-open'], deps), 0);
  assert.equal(existsSync(join(dir, 'out', 'dashboard.html')), true);
});
