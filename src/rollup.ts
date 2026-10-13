import type { Collected, ModuleResult, NoDataModule, OkModule, RunFailedDetail } from './collect.ts';
import { rates } from './health.ts';
import type { Rates } from './health.ts';
import type { Counts } from './stats.ts';

export type Summary = { counts: Counts } & Rates & { modulesReporting: number; modulesTotal: number; modulesFailed: number };
export type OkModuleRow = Pick<OkModule, 'name' | 'status' | 'counts'> & Rates & Omit<OkModule, 'name' | 'status' | 'counts' | 'source'>;
export type RunFailedRow = {
  name: string;
  status: 'run-failed';
  reason: RunFailedDetail;
  counts: null;
  passRate: null;
  unhealthyRate: null;
  durationMs: null;
  runDate: string;
  stale: boolean;
  runUrl: string;
};
export type ModuleRow = OkModuleRow | RunFailedRow | NoDataModule;
export type RepoRow = { name: string } & Summary & { modules: ModuleRow[] };
export type ProductRow = { name: string } & Summary & { repos: RepoRow[] };
export type Dashboard = { schemaVersion: 1; generatedAt: string; products: ProductRow[] };

type Tally = { counts: Counts; modulesReporting: number; modulesTotal: number; modulesFailed: number };

const ZERO: Counts = { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };

const add = (a: Counts, b: Counts): Counts => ({
  total: a.total + b.total,
  passed: a.passed + b.passed,
  failed: a.failed + b.failed,
  skipped: a.skipped + b.skipped,
  flaky: a.flaky + b.flaky,
});

// A module without counts adds nothing to the sums but still counts as a module.
const moduleTally = (mod: ModuleResult): Tally =>
  mod.status === 'ok'
    ? { counts: mod.counts, modulesReporting: 1, modulesTotal: 1, modulesFailed: 0 }
    : { counts: ZERO, modulesReporting: 0, modulesTotal: 1, modulesFailed: mod.status === 'run-failed' ? 1 : 0 };

// Rates come from the summed counts. They are never averages of the parts' rates.
const summarize = (parts: Tally[]): Summary => {
  const counts = parts.reduce((total, part) => add(total, part.counts), ZERO);
  return {
    counts,
    ...rates(counts),
    modulesReporting: parts.reduce((total, part) => total + part.modulesReporting, 0),
    modulesTotal: parts.reduce((total, part) => total + part.modulesTotal, 0),
    modulesFailed: parts.reduce((total, part) => total + part.modulesFailed, 0),
  };
};

const moduleRow = (mod: ModuleResult): ModuleRow => {
  if (mod.status === 'no-data') return mod;
  if (mod.status === 'run-failed') {
    const { source, name, status, reason, ...rest } = mod;
    return { name, status, reason, counts: null, passRate: null, unhealthyRate: null, durationMs: null, ...rest };
  }
  const { name, status, counts, source, ...rest } = mod;
  return { name, status, counts, ...rates(counts), ...rest };
};

export function rollup(collected: Collected, generatedAt: Date): Dashboard {
  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    products: collected.products.map((product) => {
      const repos = product.repos.map((repo) => ({
        name: repo.name,
        ...summarize(repo.modules.map(moduleTally)),
        modules: repo.modules.map(moduleRow),
      }));
      return { name: product.name, ...summarize(repos), repos };
    }),
  };
}
