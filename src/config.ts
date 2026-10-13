import { readFileSync } from 'node:fs';

export type ModuleConfig = {
  name: string;
  workflow: string;
  artifactPrefix: string;
  events?: string[];
  staleAfterDays?: number;
};

export type RepoConfig = { name: string; modules: ModuleConfig[] };
export type ProductConfig = { name: string; repos: RepoConfig[] };

export type Config = {
  owner: string;
  branch: string;
  staleAfterDays: number;
  roseAtPassRate: number;
  mode: 'artifacts' | 'history';
  products: ProductConfig[];
};

// Owner, repo, and workflow values become gh arguments and API paths, so their characters are limited.
const DEFAULT_ROSE_AT_PASS_RATE = 0.8;
const SLUG = /^[A-Za-z0-9._-]+$/;

function fail(field: string, rule: string): never {
  throw new Error(`Invalid config: ${field} ${rule}`);
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(field, 'must be a non-empty string');
  return value as string;
}

function slug(value: unknown, field: string): string {
  const checked = text(value, field);
  if (!SLUG.test(checked)) fail(field, 'may only contain letters, digits, dots, dashes, and underscores');
  return checked;
}

function days(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(field, 'must be a number greater than 0');
  }
  return value as number;
}

function roseAt(value: unknown, field: string): number {
  if (value === undefined) return DEFAULT_ROSE_AT_PASS_RATE;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    fail(field, 'must be a number from 0 up to but not including 1');
  }
  return value;
}

function mode(value: unknown, field: string): 'artifacts' | 'history' {
  if (value === undefined) return 'artifacts';
  if (value !== 'artifacts' && value !== 'history') fail(field, 'must be "artifacts" or "history"');
  return value as 'artifacts' | 'history';
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) fail(field, 'must be a non-empty list');
  return value as unknown[];
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(field, 'must be an object');
  return value as Record<string, unknown>;
}

function parseModule(raw: unknown, field: string): ModuleConfig {
  const mod = record(raw, field);
  return {
    name: text(mod.name, `${field}.name`),
    workflow: slug(mod.workflow, `${field}.workflow`),
    artifactPrefix: text(mod.artifactPrefix, `${field}.artifactPrefix`),
    ...(mod.events === undefined
      ? {}
      : { events: list(mod.events, `${field}.events`).map((event, i) => text(event, `${field}.events[${i}]`)) }),
    ...(mod.staleAfterDays === undefined
      ? {}
      : { staleAfterDays: days(mod.staleAfterDays, `${field}.staleAfterDays`) }),
  };
}

function parseRepo(raw: unknown, field: string): RepoConfig {
  const repo = record(raw, field);
  return {
    name: slug(repo.name, `${field}.name`),
    modules: list(repo.modules, `${field}.modules`).map((mod, i) => parseModule(mod, `${field}.modules[${i}]`)),
  };
}

function parseProduct(raw: unknown, field: string): ProductConfig {
  const product = record(raw, field);
  return {
    name: text(product.name, `${field}.name`),
    repos: list(product.repos, `${field}.repos`).map((repo, i) => parseRepo(repo, `${field}.repos[${i}]`)),
  };
}

export function parseConfig(raw: unknown): Config {
  const config = record(raw, 'config');
  return {
    owner: slug(config.owner, 'owner'),
    branch: text(config.branch, 'branch'),
    staleAfterDays: days(config.staleAfterDays, 'staleAfterDays'),
    roseAtPassRate: roseAt(config.roseAtPassRate, 'roseAtPassRate'),
    mode: mode(config.mode, 'mode'),
    products: list(config.products, 'products').map((product, i) => parseProduct(product, `products[${i}]`)),
  };
}

export function loadConfig(path: string): Config {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Config file not found: ${path}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Invalid config: ${path} is not valid JSON`);
  }
  return parseConfig(raw);
}
