# qack-pulse

Shows the latest test automation results on one HTML page. It reads Playwright reports from GitHub Actions artifacts and rolls the counts up from module to repo to product.

Outputs, written to `out/` (ignored by git)

- `dashboard.html`, the main page
- `dashboard.json`, the same numbers plus trend data
- `history.html`, a month calendar per workflow job

The page and the JSON hold counts, names, dates, and run links only. They never hold test names or request data.

## Requirements

- Node 24 or newer (runs the TypeScript files directly)
- [`gh`](https://cli.github.com), logged in with read access to every configured repo
- No npm packages to install

## Usage

```
npm run dashboard                # build and open the page
npm run dashboard -- --no-open   # build only
npm run backfill                 # add history from runs gh still lists
npm test
npm run coverage
```

`data/history.jsonl` stores one line per run and artifact. It is append-only and ignored by git.

## How it works

For each module in `dashboard.config.json`, the script:

1. Lists the newest runs of the module's workflow on the configured branch.
2. Picks the newest run that finished as `success` or `failure`. If the module sets `events`, only runs from those triggers count.
3. Finds the run's unexpired artifacts whose name starts with `artifactPrefix`, from the newest attempt only.
4. Downloads each artifact and reads the `stats` block from `test-results/test-results.json`.
5. Adds up the shards of a module, then the modules of a repo, then the repos of a product.

A module shows as stale when its newest run is older than `staleAfterDays`.

## Register a new project

A project is one entry under `products` in `dashboard.config.json`. The shape is product, then repos, then modules.

```json
{
  "name": "Lockbox",
  "repos": [
    {
      "name": "lockbox-ui-automation",
      "modules": [
        { "name": "backoffice-ui", "workflow": "regression-tests.yml", "artifactPrefix": "playwright-report-" }
      ]
    }
  ]
}
```

### 1. Check the test repo

The repo's workflow must meet all of these.

- Playwright runs with the JSON reporter, written to `test-results/test-results.json`.
- The workflow uploads that folder with `actions/upload-artifact`. The artifact name starts with a fixed prefix, for example `playwright-report-`.
- The workflow runs on the branch set in `branch` (default `main`). Sharded runs may upload one artifact per shard. All shards of the newest attempt are summed.
- A re-run uploads names that end in `-<runNumber>-<attempt>`. This is how the newest attempt is found.

Artifacts expire (GitHub default is 90 days). An expired artifact counts as no data.

### 2. Add the entry

Edit `dashboard.config.json`.

- New product. Add an object to `products`.
- New repo in an existing product. Add an object to that product's `repos`.
- New module in an existing repo. Add an object to that repo's `modules`.

Fields

| Field | Level | Required | Meaning |
|-------|-------|----------|---------|
| `owner` | top | yes | GitHub org or user that owns every repo |
| `branch` | top | yes | Branch whose runs are read |
| `staleAfterDays` | top | yes | Default age before a module is marked stale |
| `roseAtPassRate` | top | no | Pass rate below which the page uses the rose color. Default `0.8` |
| `name` | product | yes | Display name |
| `name` | repo | yes | Exact GitHub repo name. Letters, digits, `.`, `-`, `_` only |
| `name` | module | yes | Display name |
| `workflow` | module | yes | Workflow file name, such as `regression.yaml` |
| `artifactPrefix` | module | yes | Artifact names start with this |
| `events` | module | no | Only count runs from these triggers, such as `["schedule"]` |
| `staleAfterDays` | module | no | Overrides the top-level value for this module |

Two modules can share a workflow. Give each its own `artifactPrefix` (see `merchant-api` and `onboard-api` in the existing config).

### 3. Check it locally

```
npm test
npm run dashboard
```

The config is validated on load. A bad value stops the run with `Invalid config: <field> <rule>`. Fix that field and run again.

Open `out/dashboard.html` and confirm the new module has counts. A module that shows no data usually means one of these.

| Symptom | Cause |
|---------|-------|
| `no-run` | The workflow name is wrong, or no finished run exists on `branch` |
| `artifact-missing` | `artifactPrefix` matches no artifact |
| `artifact-expired` | Every matching artifact is past retention |
| `stats-missing` | The artifact has no `test-results/test-results.json`, or its `stats` block is invalid |
| `fetch-failed` | `gh` cannot read the repo. Check access. The warning on stderr has the reason |

### 4. Pull in past runs (optional)

```
npm run backfill
```

This adds a history line for every unexpired artifact of every finished run `gh` still lists. Lines already in the file are skipped, so it is safe to run twice.

### 5. Give CI access

The published dashboard builds in `.github/workflows/dashboard.yaml` with the `QACK_PULSE_TOKEN` secret. If the new repo is not already readable by that token, grant the token read access to the repo's Actions runs and artifacts. Without it, the CI build shows `fetch-failed` for the new modules.

Open a PR with the config change. The workflow runs on push to `main`, daily at 04:00 UTC, and on manual dispatch.

## Published page

CI encrypts `dashboard.html` and `history.html` with the `PULSE_PASSCODE` secret (at least 16 characters) and deploys them to GitHub Pages. `dashboard.json` is not published.

## Code layout and conventions

See `AGENTS.md` for the file map and the rules for changing code.
