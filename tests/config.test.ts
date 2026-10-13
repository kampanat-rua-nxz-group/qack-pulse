import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig, parseConfig } from '../src/config.ts';
import { oneModuleConfig } from './helpers.ts';

const MODULE = 'products[0].repos[0].modules[0]';

// A copy of the valid config with the first module's fields replaced.
const withModule = (patch: Record<string, unknown>) => {
  const config = oneModuleConfig();
  const [product] = config.products;
  const [repo] = product.repos;
  return { ...config, products: [{ ...product, repos: [{ ...repo, modules: [{ ...repo.modules[0], ...patch }] }] }] };
};

// A copy of the valid config with the first repo's fields replaced.
const withRepo = (patch: Record<string, unknown>) => {
  const config = oneModuleConfig();
  const [product] = config.products;
  return { ...config, products: [{ ...product, repos: [{ ...product.repos[0], ...patch }] }] };
};

test('accepts a valid config and keeps the optional module fields', () => {
  assert.deepEqual(parseConfig(oneModuleConfig()), oneModuleConfig());
  const parsed = parseConfig(withModule({ events: ['schedule'], staleAfterDays: 8 }));
  assert.deepEqual(parsed.products[0].repos[0].modules[0], {
    name: 'merchant-api',
    workflow: 'regression.yaml',
    artifactPrefix: 'report-merchant-',
    events: ['schedule'],
    staleAfterDays: 8,
  });
});

const invalid: [string, unknown, string][] = [
  ['a config that is not an object', [], 'Invalid config: config must be an object'],
  ['an empty owner', { ...oneModuleConfig(), owner: '' }, 'Invalid config: owner must be a non-empty string'],
  ['an owner with a slash', { ...oneModuleConfig(), owner: 'nxz/group' }, 'Invalid config: owner may only contain letters, digits, dots, dashes, and underscores'],
  ['a missing branch', { ...oneModuleConfig(), branch: undefined }, 'Invalid config: branch must be a non-empty string'],
  ['a zero stale threshold', { ...oneModuleConfig(), staleAfterDays: 0 }, 'Invalid config: staleAfterDays must be a number greater than 0'],
  ['no products', { ...oneModuleConfig(), products: [] }, 'Invalid config: products must be a non-empty list'],
  ['a product without a name', { ...oneModuleConfig(), products: [{ repos: [] }] }, 'Invalid config: products[0].name must be a non-empty string'],
  ['a repo name that walks the API path', withRepo({ name: '../../orgs' }), 'Invalid config: products[0].repos[0].name may only contain letters, digits, dots, dashes, and underscores'],
  ['a repo without modules', withRepo({ modules: [] }), 'Invalid config: products[0].repos[0].modules must be a non-empty list'],
  ['a module that is not an object', withRepo({ modules: ['merchant-api'] }), `Invalid config: ${MODULE} must be an object`],
  ['a module without a name', withModule({ name: ' ' }), `Invalid config: ${MODULE}.name must be a non-empty string`],
  ['a workflow with a space', withModule({ workflow: 'regression.yaml --all' }), `Invalid config: ${MODULE}.workflow may only contain letters, digits, dots, dashes, and underscores`],
  ['a missing artifact prefix', withModule({ artifactPrefix: undefined }), `Invalid config: ${MODULE}.artifactPrefix must be a non-empty string`],
  ['empty events', withModule({ events: [] }), `Invalid config: ${MODULE}.events must be a non-empty list`],
  ['an event that is not text', withModule({ events: ['schedule', 7] }), `Invalid config: ${MODULE}.events[1] must be a non-empty string`],
  ['a negative module stale threshold', withModule({ staleAfterDays: -1 }), `Invalid config: ${MODULE}.staleAfterDays must be a number greater than 0`],
];

for (const [label, raw, message] of invalid) {
  test(`rejects ${label} and names the field`, () => {
    assert.throws(() => parseConfig(raw), { message });
  });
}

test('loadConfig reads and validates a file', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'qack-pulse-test-')), 'dashboard.config.json');
  writeFileSync(path, JSON.stringify(oneModuleConfig()));
  assert.deepEqual(loadConfig(path), oneModuleConfig());
});

test('loadConfig explains a missing file and a file that is not JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qack-pulse-test-'));
  assert.throws(() => loadConfig(join(dir, 'none.json')), /Config file not found: .*none\.json/);
  writeFileSync(join(dir, 'bad.json'), '{ owner: ');
  assert.throws(() => loadConfig(join(dir, 'bad.json')), /Invalid config: .*bad\.json is not valid JSON/);
});

test('defaults roseAtPassRate to 0.8 and mode to artifacts, and keeps given values', () => {
  const { roseAtPassRate, mode, ...bare } = oneModuleConfig();
  assert.equal(parseConfig(bare).roseAtPassRate, 0.8);
  assert.equal(parseConfig(bare).mode, 'artifacts');
  const parsed = parseConfig({ ...bare, roseAtPassRate: 0.5, mode: 'history' });
  assert.deepEqual([parsed.roseAtPassRate, parsed.mode], [0.5, 'history']);
  assert.equal(parseConfig({ ...bare, roseAtPassRate: 0 }).roseAtPassRate, 0);
});

for (const value of [1, -0.1, '0.8', Number.NaN]) {
  test(`rejects roseAtPassRate ${String(value)} and names the field`, () => {
    assert.throws(() => parseConfig({ ...oneModuleConfig(), roseAtPassRate: value }), {
      message: 'Invalid config: roseAtPassRate must be a number from 0 up to but not including 1',
    });
  });
}

test('rejects an unknown mode and names the field', () => {
  assert.throws(() => parseConfig({ ...oneModuleConfig(), mode: 'live' }), {
    message: 'Invalid config: mode must be "artifacts" or "history"',
  });
});
