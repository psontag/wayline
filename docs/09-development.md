# Development

## Tools

| Tool | Use |
|---|---|
| pnpm | Package manager, monorepo workspaces |
| Vite | Web app dev server and build |
| cf | Run, build and deploy the Worker, local D1 |
| Wrangler | Bundler behind cf. Secrets and live logs. |
| Vitest | Unit and integration tests |
| ESLint, Prettier | Lint and format |
| GitHub Actions | CI, deploy, data pipeline |

## Local setup

```sh
pnpm install
pnpm --filter @wayline/api db:migrate   # local D1 schema, once per new migration
pnpm dev        # web app and Worker
pnpm check      # lint, typecheck, test, format check
```

`pnpm dev` runs the web app with Vite and the Worker with `cf dev`. Vite forwards `/api` to the Worker. D1 runs locally.

- Ports start at `5173` (web) and `8787` (Worker). When a port is in use, the next free one is taken, so several checkouts can run at once. Vite prints its address.
- `PORT` sets the web port, `WAYLINE_API_PORT` the Worker port.

### Worktrees

Env files, region data and the local D1 are git-ignored, so a new worktree has none of them.

```sh
pnpm setup:worktree
```

- Symlinks `apps/api/.dev.vars`, `apps/web/.env.local` and `apps/api/.wrangler/state` from the main checkout. Then applies migrations.
- All worktrees share one D1 and one set of env files. A change in one applies to all.
- Route data and the pipeline cache live in the main checkout. The script links each dataset and `pipeline/cache`. Datasets or a cache found in the worktree move to the main checkout first.
- `latest.json` is copied, not linked. Each checkout picks its own dataset.
- Run it again to pick up datasets built later. `pnpm data:build` does this itself.
- `.claude/launch.json` has one config for the Claude desktop app. `wayline` runs `pnpm dev`.

### Claude Code

`.claude/settings.json` sets up the sandbox and hooks.

- `git` and `gh` run outside the sandbox.
- `.claude/hooks/guard-bash.js` blocks `python`, `pip` and `sed -i`, and asks before `PROVIDERS=live`.
- Read-only `git`, `gh` and check commands are allowed without a prompt.
- Project skills in `.claude/skills/`: `ship` (issue to merged PR) and `verify-ui` (light and dark, desktop and phone in the browser pane).

### Cleanup

`pnpm worktree:prune` lists worktrees and local branches merged into `origin/main`. `--yes` removes them. It keeps the current checkout, worktrees with uncommitted changes and worktrees a process runs in. Route data in a removed worktree moves to the main checkout first.

The Worker config is `apps/api/cloudflare.config.ts`. Build settings, such as the assets folder, are in `apps/api/wrangler.config.ts`. `cf` writes generated files to `.cloudflare/` (git-ignored).

| Command | Does |
|---|---|
| `pnpm build` | Builds the web app, then the Worker with `cf build` |
| `pnpm report:trips` | Reports how proposals come out on fixed test trips. Needs the built data. |
| `pnpm bench` | Times the proposal search on fixed trips and counts its work. Needs the built data. See below. |
| `pnpm --filter @wayline/api exec cf deploy --dry-run` | Checks the deploy without uploading |
| `pnpm --filter @wayline/api exec cf workers types` | Writes `Env` and runtime types. `typecheck` runs it. |

## Providers in development

Local development and tests never call external APIs by default. There are two kinds of fakes.

| Kind | Where | Use |
|---|---|---|
| Recorded fixtures | `packages/providers/fixtures/` | Adapter parsing tests only |
| `FakeRouting`, `FakeWeather`, `FakeTrains` | `packages/providers` | Deterministic data for any input. Planner, API and UI tests, local dev. |

`PROVIDERS=live` switches to the real APIs.

Routing switches:

| Setting | Where | Effect |
|---|---|---|
| `VITE_ROUTING=local` | `apps/web/.env.local` | The web app and the generator route on the routing tiles of the dataset (`LocalRouting`). Needs a dataset built with routing tiles. Default: `FakeRouting` on the route network. The deploy sets it. |

Weather:

| Setting | Where | Effect |
|---|---|---|
| `VITE_WEATHER=open-meteo` | `apps/web/.env.local` | The web app asks Open-Meteo (`OpenMeteoWeather`). Default: `FakeWeather`. The deploy sets it. |
| `VITE_TRAINS=transitous` | `apps/web/.env.local` | The web app asks Transitous for trains (`TransitousTrains`). `db-rest` asks db.transport.rest. Default: `FakeTrains`. The deploy sets `transitous`. |

Trips and login:

| Setting | Where | Effect |
|---|---|---|
| `VITE_TRIPS=api` | `apps/web/.env.local` | Trips are saved in the local D1 through `/api/trips` (`ApiTripStore`). Trips in browser storage move there on first use. Default: browser storage. |
| `DEV_USER_EMAIL=you@example.com` | `apps/api/.dev.vars` | The user for `/api/me` and `/api/trips` without Access. Change it and restart `pnpm dev` to act as another user. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | Worker vars | Team domain (`https://<team>.cloudflareaccess.com`) and AUD tag of the Access app. When both are set, the Worker verifies the Access JWT and ignores `DEV_USER_EMAIL`. |

Geodata:

- The app uses the region data named by `apps/web/public/data/latest.json` (`pnpm data:build`, see `pipeline/README.md`).
- Without it, or with `VITE_DATA=mock` in `apps/web/.env.local`, it uses the Oberfranken mock.
- Tests use the mock and the Heidelberg tiles in `apps/web/public/data/mock/`.

## Tests

| Package | What |
|---|---|
| `domain`, `planner` | Unit tests. Stage cutting, scoring, recompute rules, schema migrations. |
| `providers` | Parsing against recorded fixtures. |
| `api` | Worker endpoints with fake providers and local D1. |
| `ui` | Contrast check over token pairs. |
| `apps/web/e2e` | Playwright, `pnpm e2e`. See below. |
| `pipeline/tests` | Ruff and pytest, `pnpm test:pipeline`. See `pipeline/README.md`. |

### Browser tests

`pnpm e2e` starts Vite on port 5188 with the Oberfranken mock, fake providers and trips in browser storage. No Worker. Today is fixed to 8 Nov 2026.

| Test | Checks |
|---|---|
| Plan a new trip | Start and end, Find routes, proposals, Open trip |
| Move a stop | Day 1 gets another stop, still there after a reload |
| Trip list | The sample trip opens. Also on phone. |

- Projects: `desktop` (1280×800) and `phone` (Pixel 7). The new trip and stop flows run on desktop only.
- Each test saves light and dark screenshots to `apps/web/e2e/out/screenshots/<project>/`. Use them for PRs.
- Traces of failed tests are in `apps/web/e2e/out/results/`: `pnpm exec playwright show-trace <trace.zip>`.
- First time: `pnpm exec playwright install chromium`.

## Search benchmark

`pnpm bench` runs the trips in `packages/planner/bench/trips.ts` and prints a table: proposals, load, ms per search step, total, and the Dijkstra work (one-to-all runs, runs to a target, nodes settled). Work counts don't depend on machine speed.

| Variable | Default | Effect |
|---|---|---|
| `BENCH_ONLY` | all | Trips whose name contains one of these, comma-separated |
| `BENCH_RUNS` | 3 | Runs per trip. Times are the median. |
| `BENCH_ROUTING` | on | `0` keeps the graph path, without the router |
| `BENCH_TIME_LIMITS` | on | `0` stops by tries only, so results and counts are the same on every machine |
| `BENCH_DATA` | `latest.json` | Dataset version in `apps/web/public/data/` |
| `BENCH_OUT` | – | Writes the results to this JSON file |
| `BENCH_BASE` | – | Compares with a JSON file from `BENCH_OUT` |

```sh
BENCH_TIME_LIMITS=0 BENCH_OUT=before.json pnpm bench
BENCH_TIME_LIMITS=0 BENCH_BASE=before.json pnpm bench
```

## Environments

| Environment | Deployed from | Data |
|---|---|---|
| Local | — | Local D1, fake providers |
| Production | `main` | Production D1, live providers |

## Secrets

- API keys are Worker secrets, set with `wrangler secret put <NAME> --name wayline-api`. `cf` cannot set a single secret yet.
- Live logs: `wrangler tail wayline-api` with the debug token (`docs/12-deploy.md`).
- Locally they go in `.dev.vars`. This file is git-ignored.
- Deploy credentials are GitHub Actions secrets.

## Database

D1 schema changes are SQL migration files in `apps/api/migrations/`.

- Locally, `pnpm --filter @wayline/api db:migrate` applies them to the D1 that `cf dev` uses (`apps/api/.wrangler/state`). API tests apply them to an in-memory D1.
- `cf d1 migrations apply --local` works too, but hangs after it is done (cf beta). Hence the script.

- Within one deploy, migrations are additive only. Destructive changes go in a later deploy.
- Never edit an applied migration.
- D1 Time Travel is the restore path.

## CI

| Trigger | Steps |
|---|---|
| Pull request | Lint, typecheck, test, format check, build. In parallel: browser tests (screenshots as the `e2e` artifact), Ruff on the pipeline. The pipeline test only when `pipeline/`, the tile reader or the mock data changed. |
| Push to `main` | Lint, typecheck, test, then deploy (`docs/12-deploy.md`). The deploy rebuilds the route data when the pipeline changed or a new month started. |
