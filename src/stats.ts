export type Counts = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
};

export type RunStats = {
  counts: Counts;
  durationMs: number | null;
  startTime: string;
};

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

// Takes the `stats` block of a Playwright JSON report. Returns null when it cannot be trusted.
export function mapStats(stats: unknown): RunStats | null {
  if (typeof stats !== 'object' || stats === null) return null;
  const { expected, unexpected, skipped, flaky, duration, startTime } = stats as Record<string, unknown>;
  if (!isCount(expected) || !isCount(unexpected) || !isCount(skipped) || !isCount(flaky)) return null;
  if (typeof startTime !== 'string' || Number.isNaN(Date.parse(startTime))) return null;
  const hasDuration = typeof duration === 'number' && Number.isFinite(duration) && duration >= 0;
  return {
    counts: {
      total: expected + unexpected + skipped + flaky,
      passed: expected,
      failed: unexpected,
      skipped,
      flaky,
    },
    durationMs: hasDuration ? Math.round(duration) : null,
    startTime: new Date(startTime).toISOString(),
  };
}

// Shards run in parallel: counts add up, the run took as long as the slowest shard, and it started with the first.
export function mergeStats(parts: RunStats[]): RunStats {
  const durations = parts.flatMap((part) => (part.durationMs === null ? [] : [part.durationMs]));
  return {
    counts: parts.reduce(
      (sum, part) => ({
        total: sum.total + part.counts.total,
        passed: sum.passed + part.counts.passed,
        failed: sum.failed + part.counts.failed,
        skipped: sum.skipped + part.counts.skipped,
        flaky: sum.flaky + part.counts.flaky,
      }),
      { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 },
    ),
    durationMs: durations.length === 0 ? null : Math.max(...durations),
    startTime: parts.map((part) => part.startTime).sort()[0],
  };
}
