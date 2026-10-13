import { readFileSync } from 'node:fs';
import type { Config } from '../src/config.ts';
import type { Gh } from '../src/gh.ts';
import type { Artifact, Run } from '../src/select.ts';

export const fixtureText = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

export const fixture = (name: string): any => JSON.parse(fixtureText(name));

export const REPO = 'nxz-group/lockbox-api-automation';

export const RUN: Run = {
  id: 102,
  attempt: 1,
  conclusion: 'success',
  event: 'schedule',
  createdAt: '2026-10-12T03:33:42Z',
  url: `https://github.com/${REPO}/actions/runs/102`,
};

export const ARTIFACT: Artifact = {
  id: 9001,
  name: 'report-merchant-102-418-1',
  expired: false,
  createdAt: '2026-10-12T03:35:52Z',
};

export const oneModuleConfig = (): Config => ({
  owner: 'nxz-group',
  branch: 'main',
  staleAfterDays: 5,
  roseAtPassRate: 0.8,
  mode: 'artifacts',
  products: [
    {
      name: 'Lockbox',
      repos: [
        {
          name: 'lockbox-api-automation',
          modules: [{ name: 'merchant-api', workflow: 'regression.yaml', artifactPrefix: 'report-merchant-' }],
        },
      ],
    },
  ],
});

// A gh that answers with one finished run, one artifact, and the fixture stats.
export const fakeGh = (overrides: Partial<Gh> = {}): Gh => ({
  listRuns: async () => [RUN],
  listArtifacts: async () => [ARTIFACT],
  downloadStats: async () => fixture('test-results.json').stats,
  ...overrides,
});
