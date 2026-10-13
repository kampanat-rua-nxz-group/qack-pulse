import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collect } from './collect.ts';
import { loadConfig } from './config.ts';
import { checkGh, createGh } from './gh.ts';
import { appendHistory, readHistory } from './history.ts';
import type { Gh } from './gh.ts';
import { renderHistory } from './history-page.ts';
import { render } from './render.ts';
import { rollup } from './rollup.ts';
import { buildTrend } from './trend.ts';

export type Deps = {
  configPath: string;
  outDir: string;
  historyPath: string;
  now: () => Date;
  checkGh: () => Promise<void>;
  createGh: (branch: string) => Gh;
  open: (path: string) => Promise<void>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function run(argv: string[], deps: Deps): Promise<number> {
  try {
    const config = loadConfig(deps.configPath);
    await deps.checkGh();
    const now = deps.now();
    const warn = (message: string): void => deps.stderr(`Warning: ${message}\n`);
    if (config.mode === 'history') throw new Error('Invalid config: mode "history" is not available yet. Use "artifacts"');
    const collected = await collect(config, deps.createGh(config.branch), now, warn);
    const dashboard = rollup(collected, now);
    await appendHistory(deps.historyPath, collected);
    const history = await readHistory(deps.historyPath);
    const trend = buildTrend(history, dashboard, now);
    await mkdir(deps.outDir, { recursive: true });
    const htmlPath = join(deps.outDir, 'dashboard.html');
    const jsonPath = join(deps.outDir, 'dashboard.json');
    await writeFile(htmlPath, render(dashboard, config.roseAtPassRate, trend));
    await writeFile(jsonPath, `${JSON.stringify({ ...dashboard, trend }, null, 2)}\n`);
    const historyPagePath = join(deps.outDir, 'history.html');
    await writeFile(historyPagePath, renderHistory(dashboard, history, now, config.roseAtPassRate));
    deps.stdout(`Wrote ${htmlPath}\nWrote ${jsonPath}\nWrote ${historyPagePath}\n`);
    if (!argv.includes('--no-open')) {
      // The files are already written, so a browser that will not open is only a warning.
      await deps.open(htmlPath).catch((error) => warn(`could not open the browser: ${messageOf(error)}`));
    }
    return 0;
  } catch (error) {
    deps.stderr(`${messageOf(error)}\n`);
    return 1;
  }
}

const openInBrowser = (path: string): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [path], (error) => (error ? reject(error) : resolve()));
  });

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  process.exitCode = await run(process.argv.slice(2), {
    configPath: join(root, 'dashboard.config.json'),
    outDir: join(root, 'out'),
    historyPath: join(root, 'data', 'history.jsonl'),
    now: () => new Date(),
    checkGh: () => checkGh(),
    createGh: (branch) => createGh(branch),
    open: openInBrowser,
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
  });
}
