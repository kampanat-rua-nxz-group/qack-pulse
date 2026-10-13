# qack-pulse

A local script that shows the latest Lockbox test automation results on one HTML page. Counts roll up from module to repo to product.

Read this first. The design spec and the implementation plan live in the Obsidian vault under `02_Projects/qack-pulse/plans/first-draft/`.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node 24 or newer. It runs the TypeScript files directly. |
| Tests | Node's built-in test runner and `node:assert/strict`. |
| Data source | GitHub Actions artifacts, read through the `gh` CLI. |
| Dependencies | None. Do not add npm packages. |

## Project structure

```
.
├── dashboard.config.json   product, repo, and module hierarchy
├── data/                   history.jsonl, ignored by git, never overwritten
├── src/
│   ├── config.ts           load and validate the config
│   ├── gh.ts               the only code that calls gh
│   ├── select.ts           pick the run and the artifacts of the newest attempt
│   ├── stats.ts            map and merge Playwright stats
│   ├── health.ts           pass rate and unhealthy rate
│   ├── collect.ts          collection steps per module
│   ├── history.ts          append to and read from data/history.jsonl without duplicates
│   ├── rollup.ts           sum modules into repos and repos into products
│   ├── trend.ts            turn history.jsonl into 14-day pass rate series and a delta
│   ├── spark.ts            draw a series as an inline SVG sparkline
│   ├── render.ts           turn the rolled-up data into HTML
│   └── cli.ts              wire the parts, write the files, open the browser
├── tests/                  one test file per source file, plus fixtures
└── out/                    generated files, ignored by git
```

## Data flow

```
dashboard.config.json → collect (gh: runs, artifacts, stats) → rollup → render → out/dashboard.html
                                                                      └→ out/dashboard.json
                                                                      history.jsonl → trend → render
```

## Commands

```
Run:       npm run dashboard
No browser: npm run dashboard -- --no-open
Test:      npm test
Coverage:  npm run coverage
```

## Key conventions

- Only `src/gh.ts` calls `gh`. Every other file gets a `Gh` object passed in, so tests use a fake.
- Node strips types without checking them. Use only erasable TypeScript: no enums, no parameter properties, no namespaces. Import with the `.ts` extension and use `import type` for types.
- The page and the JSON file hold counts, names, dates, and run links only. Never write test names, request data, or response data.
- Escape every value from the config or GitHub before it goes into HTML.
- Return new objects. Do not change arguments in place.
- No `console.log`. The CLI writes through its `stdout` and `stderr` functions.
- Write the test first. Keep line coverage at 80 percent or more.
- Keep each file under 300 lines.
