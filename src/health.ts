import type { Counts } from './stats.ts';

export type Rates = { passRate: number | null; unhealthyRate: number | null };

// Rates use executed tests, which is total minus skipped. Null means there is no rate to show.
export function rates(counts: Counts): Rates {
  const executed = counts.total - counts.skipped;
  if (executed <= 0) return { passRate: null, unhealthyRate: null };
  return {
    passRate: counts.passed / executed,
    unhealthyRate: (counts.failed + counts.flaky) / executed,
  };
}
