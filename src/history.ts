import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Collected, ModuleResult } from './collect.ts';

export type HistoryLine = Record<string, unknown>;
type Line = HistoryLine;

const lineKey = (line: Line): string => `${line.runId}|${line.attempt}|${line.artifact ?? line.module}`;

// Counts, names, dates, and run links only. No test names or response data.
function linesFor(repo: string, mod: ModuleResult): Line[] {
  if (mod.status === 'no-data') return [];
  const base = { schemaVersion: 1, repo, module: mod.name, runId: mod.source.runId, attempt: mod.source.attempt };
  if (mod.status === 'run-failed') {
    return [{ ...base, status: 'run-failed', workflow: mod.source.workflow, event: mod.source.event, runUrl: mod.runUrl }];
  }
  return mod.source.artifacts.map(({ name, stats }) => ({
    ...base,
    artifact: name,
    workflow: mod.source.workflow,
    event: mod.source.event,
    startTime: stats.startTime,
    durationMs: stats.durationMs,
    passed: stats.counts.passed,
    failed: stats.counts.failed,
    skipped: stats.counts.skipped,
    flaky: stats.counts.flaky,
    runUrl: mod.runUrl,
  }));
}

// Reads every line that parses to a JSON object. A missing file is an empty history.
// A damaged line stays in the file and is ignored.
export async function readHistory(path: string): Promise<Line[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  const lines: Line[] = [];
  for (const row of text.split('\n')) {
    if (row.trim() === '') continue;
    try {
      const parsed: unknown = JSON.parse(row);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) lines.push(parsed as Line);
    } catch {
      // A damaged line stays in the file and is ignored.
    }
  }
  return lines;
}

async function existingKeys(path: string): Promise<Set<string>> {
  return new Set((await readHistory(path)).map(lineKey));
}

// Appends one line per artifact of each ok module and one per run-failed module.
// A line with the same run, attempt, and artifact (or module) is never written twice.
export async function appendHistory(path: string, collected: Collected): Promise<number> {
  const seen = await existingKeys(path);
  const fresh: Line[] = [];
  for (const product of collected.products) {
    for (const repo of product.repos) {
      for (const mod of repo.modules) {
        for (const line of linesFor(repo.name, mod)) {
          const key = lineKey(line);
          if (seen.has(key)) continue;
          seen.add(key);
          fresh.push(line);
        }
      }
    }
  }
  if (fresh.length === 0) return 0;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, fresh.map((line) => `${JSON.stringify(line)}\n`).join(''));
  return fresh.length;
}
