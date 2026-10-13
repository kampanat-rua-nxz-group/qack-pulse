import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Artifact, Run } from './select.ts';

export type Exec = (args: string[]) => Promise<string>;

export type Gh = {
  listRuns(repo: string, workflow: string): Promise<Run[]>;
  listArtifacts(repo: string, runId: number): Promise<Artifact[]>;
  downloadStats(repo: string, runId: number, artifactName: string): Promise<unknown>;
};

type GhRun = { databaseId: number; attempt: number; conclusion: string; event: string; createdAt: string; url: string };
type GhArtifact = { id: number; name: string; expired: boolean; created_at: string };

const RUN_LIMIT = '50';
const REPORT_PATH = ['test-results', 'test-results.json'];

export const ghExec: Exec = (args) =>
  new Promise((resolve, reject) => {
    execFile('gh', args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });

// `repo` is always "owner/name". `exec` is replaceable so tests never call the real gh.
export function createGh(branch: string, exec: Exec = ghExec): Gh {
  return {
    async listRuns(repo, workflow) {
      const out = await exec([
        'run', 'list',
        '--repo', repo,
        '--workflow', workflow,
        '--branch', branch,
        '--limit', RUN_LIMIT,
        '--json', 'databaseId,attempt,conclusion,event,createdAt,url',
      ]);
      return (JSON.parse(out) as GhRun[]).map((run) => ({
        id: run.databaseId,
        attempt: run.attempt,
        conclusion: run.conclusion,
        event: run.event,
        createdAt: run.createdAt,
        url: run.url,
      }));
    },

    async listArtifacts(repo, runId) {
      const out = await exec(['api', `repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`]);
      return (JSON.parse(out) as { artifacts: GhArtifact[] }).artifacts.map((artifact) => ({
        id: artifact.id,
        name: artifact.name,
        expired: artifact.expired,
        createdAt: artifact.created_at,
      }));
    },

    // Returns the report's `stats` block, or null when the report or the block is absent.
    async downloadStats(repo, runId, artifactName) {
      const dir = await mkdtemp(join(tmpdir(), 'qack-pulse-'));
      try {
        await exec(['run', 'download', String(runId), '--repo', repo, '--name', artifactName, '--dir', dir]);
        try {
          const report = JSON.parse(await readFile(join(dir, ...REPORT_PATH), 'utf8'));
          return report?.stats ?? null;
        } catch {
          return null;
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

export async function checkGh(exec: Exec = ghExec): Promise<void> {
  try {
    await exec(['--version']);
  } catch {
    throw new Error('GitHub CLI (gh) was not found. Install it with: brew install gh');
  }
  try {
    await exec(['auth', 'status']);
  } catch {
    throw new Error('GitHub CLI (gh) is not logged in. Run: gh auth login');
  }
}
