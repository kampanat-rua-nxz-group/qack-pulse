export type Run = {
  id: number;
  attempt: number;
  conclusion: string;
  event: string;
  createdAt: string;
  url: string;
};

export type Artifact = {
  id: number;
  name: string;
  expired: boolean;
  createdAt: string;
};

export type ArtifactPick =
  | { artifacts: Artifact[] }
  | { reason: 'artifact-missing' | 'artifact-expired' };

const FINISHED = ['success', 'failure'];

const newest = <T extends { createdAt: string }>(items: T[]): T | null =>
  items.reduce<T | null>(
    (best, item) => (best === null || Date.parse(item.createdAt) > Date.parse(best.createdAt) ? item : best),
    null,
  );

// Newest run that finished as success or failure. `events` limits which triggers count.
export function selectRun(runs: Run[], events?: string[]): Run | null {
  return newest(
    runs.filter((run) => FINISHED.includes(run.conclusion) && (!events || events.includes(run.event))),
  );
}

// A re-run uploads artifacts with a higher attempt number at the end of the name:
// <prefix><runId>-<runNumber>-<attempt>. Names without that shape count as one attempt.
export const attemptOf =(name: string): string => name.match(/-\d+-\d+-(\d+)(?:-|$)/)?.[1] ?? '';

// Every unexpired artifact of the module from the newest attempt. A sharded module has one per shard.
export function selectArtifacts(artifacts: Artifact[], prefix: string): ArtifactPick {
  const matching = artifacts.filter((artifact) => artifact.name.startsWith(prefix));
  if (matching.length === 0) return { reason: 'artifact-missing' };
  const live = matching.filter((candidate) => !candidate.expired);
  const latest = newest(live);
  if (!latest) return { reason: 'artifact-expired' };
  const attempt = attemptOf(latest.name);
  return { artifacts: live.filter((artifact) => attemptOf(artifact.name) === attempt) };
}
