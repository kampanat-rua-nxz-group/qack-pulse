import type { Config, ModuleConfig } from './config.ts';
import type { Gh } from './gh.ts';
import { selectArtifacts, selectRun } from './select.ts';
import type { Artifact, Run } from './select.ts';
import { mapStats, mergeStats } from './stats.ts';
import type { Counts, RunStats } from './stats.ts';

export type NoDataReason = 'no-run' | 'artifact-expired' | 'artifact-missing' | 'stats-missing' | 'fetch-failed';
export type RunFailedDetail = 'artifact-missing' | 'stats-missing';

// Where a result came from. history.ts reads it. It is not part of dashboard.json.
export type Source = {
  runId: number;
  attempt: number;
  workflow: string;
  event: string;
  artifacts: { name: string; stats: RunStats }[];
};

export type OkModule = {
  name: string;
  status: 'ok';
  counts: Counts;
  durationMs: number | null;
  startTime: string;
  stale: boolean;
  runUrl: string;
  source: Source;
};

export type RunFailedModule = {
  name: string;
  status: 'run-failed';
  reason: RunFailedDetail;
  runDate: string;
  stale: boolean;
  runUrl: string;
  source: Source;
};

export type NoDataModule = {
  name: string;
  status: 'no-data';
  reason: NoDataReason;
  runDate: string | null;
  stale: boolean;
  runUrl: string | null;
};

export type ModuleResult = OkModule | RunFailedModule | NoDataModule;
export type CollectedRepo = { name: string; modules: ModuleResult[] };
export type CollectedProduct = { name: string; repos: CollectedRepo[] };
export type Collected = { products: CollectedProduct[] };

const DAY_MS = 24 * 60 * 60 * 1000;

// Starts each lookup once. Modules that share a workflow or a run share the answer.
function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit;
  const loading = load();
  cache.set(key, loading);
  return loading;
}

export async function collect(
  config: Config,
  gh: Gh,
  now: Date,
  warn: (message: string) => void = () => {},
): Promise<Collected> {
  const runs = new Map<string, Promise<Run[]>>();
  const artifacts = new Map<string, Promise<Artifact[]>>();

  const collectModule = async (repo: string, mod: ModuleConfig): Promise<ModuleResult> => {
    let run: Run | null = null;
    const staleAfterMs = (mod.staleAfterDays ?? config.staleAfterDays) * DAY_MS;
    const isStale = (iso: string): boolean => now.getTime() - Date.parse(iso) > staleAfterMs;
    const noData = (reason: NoDataReason): NoDataModule => ({
      name: mod.name,
      status: 'no-data',
      reason,
      runDate: run?.createdAt ?? null,
      stale: run ? isStale(run.createdAt) : false,
      runUrl: run?.url ?? null,
    });
    const sourceOf = (found: Run, artifacts: Source['artifacts']): Source => ({
      runId: found.id,
      attempt: found.attempt,
      workflow: mod.workflow,
      event: found.event,
      artifacts,
    });
    // A failed run without usable results is a finding, not a gap in the data.
    const withoutResults = (found: Run, reason: RunFailedDetail): ModuleResult =>
      found.conclusion === 'failure'
        ? {
            name: mod.name,
            status: 'run-failed',
            reason,
            runDate: found.createdAt,
            stale: isStale(found.createdAt),
            runUrl: found.url,
            source: sourceOf(found, []),
          }
        : noData(reason);
    try {
      const repoRuns = await cached(runs, `${repo} ${mod.workflow}`, () => gh.listRuns(repo, mod.workflow));
      run = selectRun(repoRuns, mod.events);
      if (!run) return noData('no-run');
      const found = run;
      const runArtifacts = await cached(artifacts, `${repo} ${found.id}`, () => gh.listArtifacts(repo, found.id));
      const pick = selectArtifacts(runArtifacts, mod.artifactPrefix);
      if ('reason' in pick) return pick.reason === 'artifact-missing' ? withoutResults(found, pick.reason) : noData(pick.reason);
      const parts = await Promise.all(
        pick.artifacts.map(async (artifact) => ({
          name: artifact.name,
          stats: mapStats(await gh.downloadStats(repo, found.id, artifact.name)),
        })),
      );
      // One unreadable shard would understate the totals, so it voids the whole module.
      const usable = parts.flatMap((part) => (part.stats ? [{ name: part.name, stats: part.stats }] : []));
      if (usable.length === 0 || usable.length < parts.length) return withoutResults(found, 'stats-missing');
      const stats = mergeStats(usable.map((part) => part.stats));
      return {
        name: mod.name,
        status: 'ok',
        counts: stats.counts,
        durationMs: stats.durationMs,
        startTime: stats.startTime,
        stale: isStale(stats.startTime),
        runUrl: found.url,
        source: sourceOf(found, usable),
      };
    } catch (error) {
      warn(`${repo} ${mod.name}: ${error instanceof Error ? error.message : String(error)}`);
      return noData('fetch-failed');
    }
  };

  return {
    products: await Promise.all(
      config.products.map(async (product) => ({
        name: product.name,
        repos: await Promise.all(
          product.repos.map(async (repo) => ({
            name: repo.name,
            modules: await Promise.all(
              repo.modules.map((mod) => collectModule(`${config.owner}/${repo.name}`, mod)),
            ),
          })),
        ),
      })),
    ),
  };
}
