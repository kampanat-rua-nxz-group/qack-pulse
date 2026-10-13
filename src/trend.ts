import { rates } from './health.ts';
import type { HistoryLine } from './history.ts';
import type { Counts } from './stats.ts';

export const TREND_DAYS = 14;
const FLAT_WITHIN = 0.01;
const MIN_POINTS = 3;
const DAY_MS = 86_400_000;

export type TrendPoint = { date: string; counts: Counts | null; passRate: number | null };
export type Direction = 'worse' | 'better' | 'flat' | 'unknown';
export type Trend = { points: TrendPoint[]; delta: number | null; direction: Direction };
export type Hierarchy = { products: { name: string; repos: { name: string; modules: { name: string }[] }[] }[] };
export type DashboardTrend = {
  days: number;
  products: { name: string; trend: Trend; repos: { name: string; trend: Trend; modules: { name: string; trend: Trend }[] }[] }[];
};

type Series = (Counts | null)[];
type DayCounts = Map<string, Counts>;
type Parsed = { module: string; run: string; startTime: string; counts: Counts };
type RunTotal = { module: string; startTime: string; counts: Counts };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const addCounts = (a: Counts, b: Counts): Counts => ({
  total: a.total + b.total,
  passed: a.passed + b.passed,
  failed: a.failed + b.failed,
  skipped: a.skipped + b.skipped,
  flaky: a.flaky + b.flaky,
});

// A line without a start time or valid counts (a run-failed line, a damaged line) is not a data point.
function parseRow(row: HistoryLine): Parsed | null {
  const { repo, module, runId, attempt, startTime, passed, failed, skipped, flaky } = row;
  if (typeof repo !== 'string' || typeof module !== 'string' || typeof startTime !== 'string') return null;
  if (Number.isNaN(Date.parse(startTime))) return null;
  if (!isCount(passed) || !isCount(failed) || !isCount(skipped) || !isCount(flaky)) return null;
  return {
    module: `${repo}|${module}`,
    run: `${runId}|${attempt}`,
    startTime: new Date(startTime).toISOString(),
    counts: { total: passed + failed + skipped + flaky, passed, failed, skipped, flaky },
  };
}

// Shards of one run add up. A run counts on the UTC day it started. The newest run of a day wins.
function lastRunPerDay(rows: HistoryLine[]): Map<string, DayCounts> {
  const runs = new Map<string, RunTotal>();
  for (const row of rows) {
    const parsed = parseRow(row);
    if (parsed === null) continue;
    const id = `${parsed.module}|${parsed.run}`;
    const prior = runs.get(id);
    runs.set(id, {
      module: parsed.module,
      startTime: prior === undefined || parsed.startTime < prior.startTime ? parsed.startTime : prior.startTime,
      counts: prior === undefined ? parsed.counts : addCounts(prior.counts, parsed.counts),
    });
  }
  const newest = new Map<string, Map<string, RunTotal>>();
  for (const run of runs.values()) {
    const days = newest.get(run.module) ?? new Map<string, RunTotal>();
    const date = run.startTime.slice(0, 10);
    const current = days.get(date);
    if (current === undefined || current.startTime < run.startTime) days.set(date, run);
    newest.set(run.module, days);
  }
  return new Map(
    [...newest].map(([module, days]) => [module, new Map([...days].map(([date, run]) => [date, run.counts] as const))] as const),
  );
}

const windowDates = (now: Date): string[] =>
  Array.from({ length: TREND_DAYS }, (_, index) =>
    new Date(now.getTime() - (TREND_DAYS - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );

// The module's own series. A day without a run is a gap.
const ownSeries = (days: DayCounts | undefined, dates: string[]): Series => dates.map((date) => days?.get(date) ?? null);

// The module's state as of each day: the counts of its newest run on or before that day.
// Repo and product series sum these, so a day when only one module ran does not look like a swing.
function carriedSeries(days: DayCounts | undefined, dates: string[]): Series {
  const keys = [...(days?.keys() ?? [])].sort();
  return dates.map((date) => {
    const key = keys.findLast((candidate) => candidate <= date);
    return (key === undefined ? undefined : days?.get(key)) ?? null;
  });
}

const sumSeries = (parts: Series[], size: number): Series =>
  Array.from({ length: size }, (_, index) => {
    const present = parts.flatMap((part) => {
      const value = part[index];
      return value === null ? [] : [value];
    });
    return present.length === 0 ? null : present.reduce(addCounts);
  });

// Latest pass rate against the mean of the earlier ones. A move of FLAT_WITHIN or less is flat.
function judge(points: TrendPoint[]): Pick<Trend, 'delta' | 'direction'> {
  const rated = points.flatMap((point) => (point.passRate === null ? [] : [point.passRate]));
  if (rated.length < MIN_POINTS) return { delta: null, direction: 'unknown' };
  const prior = rated.slice(0, -1);
  const delta = rated[rated.length - 1] - prior.reduce((sum, value) => sum + value, 0) / prior.length;
  const direction = Math.abs(delta) <= FLAT_WITHIN + 1e-9 ? 'flat' : delta < 0 ? 'worse' : 'better';
  return { delta, direction };
}

function trendOf(dates: string[], series: Series): Trend {
  const points = dates.map((date, index) => {
    const counts = series[index];
    return { date, counts, passRate: counts === null ? null : rates(counts).passRate };
  });
  return { points, ...judge(points) };
}

export function buildTrend(rows: HistoryLine[], hierarchy: Hierarchy, now: Date): DashboardTrend {
  const dates = windowDates(now);
  const byModule = lastRunPerDay(rows);
  return {
    days: TREND_DAYS,
    products: hierarchy.products.map((product) => {
      const repos = product.repos.map((repo) => {
        const modules = repo.modules.map((mod) => {
          const days = byModule.get(`${repo.name}|${mod.name}`);
          return { name: mod.name, trend: trendOf(dates, ownSeries(days, dates)), carried: carriedSeries(days, dates) };
        });
        const carried = sumSeries(modules.map((mod) => mod.carried), dates.length);
        return {
          name: repo.name,
          trend: trendOf(dates, carried),
          carried,
          modules: modules.map(({ name, trend }) => ({ name, trend })),
        };
      });
      return {
        name: product.name,
        trend: trendOf(dates, sumSeries(repos.map((repo) => repo.carried), dates.length)),
        repos: repos.map(({ name, trend, modules }) => ({ name, trend, modules })),
      };
    }),
  };
}
