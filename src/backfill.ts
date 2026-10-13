import { join } from 'node:path';
import type { Collected, ModuleResult } from './collect.ts';
import { loadConfig } from './config.ts';
import type { Config, ModuleConfig } from './config.ts';
import { checkGh, createGh } from './gh.ts';
import type { Gh } from './gh.ts';
import { appendHistory } from './history.ts';
import { attemptOf } from './select.ts';
import type { Run } from './select.ts';
import { mapStats } from './stats.ts';
import type { RunStats } from './stats.ts';

type Part = { name: string; stats: RunStats };

const FINISHED = ['success', 'failure'];

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Wraps one attempt of one run in the shape appendHistory reads. Only `source` and `runUrl` are used.
function moduleOf(mod: ModuleConfig, run: Run, attempt: number, artifacts: Part[]): ModuleResult {
  return {
    name: mod.name,
    status: 'ok',
    counts: artifacts[0].stats.counts,
    durationMs: artifacts[0].stats.durationMs,
    startTime: artifacts[0].stats.startTime,
    stale: false,
    runUrl: run.url,
    source: { runId: run.id, attempt, workflow: mod.workflow, event: run.event, artifacts },
  };
}

// Reads every unexpired artifact of one run and groups the usable ones by attempt.
async function partsOfRun(
  gh: Gh,
  repo: string,
  mod: ModuleConfig,
  run: Run,
  warn: (message: string) => void,
): Promise<Map<number, Part[]>> {
  const live = (await gh.listArtifacts(repo, run.id)).filter(
    (artifact) => artifact.name.startsWith(mod.artifactPrefix) && !artifact.expired,
  );
  const byAttempt = new Map<number, Part[]>();
  for (const artifact of live) {
    try {
      const stats = mapStats(await gh.downloadStats(repo, run.id, artifact.name));
      if (!stats) continue;
      const attempt = Number(attemptOf(artifact.name)) || run.attempt;
      byAttempt.set(attempt, [...(byAttempt.get(attempt) ?? []), { name: artifact.name, stats }]);
    } catch (error) {
      warn(`${repo} ${mod.name} ${artifact.name}: ${messageOf(error)}`);
    }
  }
  return byAttempt;
}

// Appends a line for every unexpired artifact of every finished run gh still lists, for all modules.
// Returns the number of lines written. Lines already in the file are not written again.
export async function backfill(
  config: Config,
  gh: Gh,
  historyPath: string,
  warn: (message: string) => void = () => {},
): Promise<number> {
  let written = 0;
  for (const product of config.products) {
    for (const repo of product.repos) {
      for (const mod of repo.modules) {
        const full = `${config.owner}/${repo.name}`;
        try {
          const runs = (await gh.listRuns(full, mod.workflow)).filter(
            (run) => FINISHED.includes(run.conclusion) && (!mod.events || mod.events.includes(run.event)),
          );
          for (const run of runs) {
            for (const [attempt, parts] of await partsOfRun(gh, full, mod, run, warn)) {
              const collected: Collected = {
                products: [{ name: product.name, repos: [{ name: repo.name, modules: [moduleOf(mod, run, attempt, parts)] }] }],
              };
              written += await appendHistory(historyPath, collected);
            }
          }
        } catch (error) {
          warn(`${repo.name} ${mod.name}: ${messageOf(error)}`);
        }
      }
    }
  }
  return written;
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const warn = (message: string): void => {
    process.stderr.write(`Warning: ${message}\n`);
  };
  try {
    const config = loadConfig(join(root, 'dashboard.config.json'));
    await checkGh();
    const count = await backfill(config, createGh(config.branch), join(root, 'data', 'history.jsonl'), warn);
    process.stdout.write(`Appended ${count} lines to data/history.jsonl\n`);
  } catch (error) {
    process.stderr.write(`${messageOf(error)}\n`);
    process.exitCode = 1;
  }
}
