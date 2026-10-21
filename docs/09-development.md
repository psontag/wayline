# Development

## Tools

| Tool | Use |
|---|---|
| pnpm | Package manager, monorepo workspaces |
| Vite | Web app dev server and build |
| cf | Run, build and deploy the Worker, local D1 |
| Wrangler | Bundler behind cf. Secrets and live logs. |
| Docker | Local BRouter |
| Vitest | Unit and integration tests |
| ESLint, Prettier | Lint and format |
| GitHub Actions | CI, deploy, data pipeline |

## Local setup

```sh
pnpm install
pnpm --filter @wayline/api db:migrate   # local D1 schema, once per new migration
pnpm dev        # web app and Worker
pnpm test
```

`pnpm dev` runs the web app with Vite on `localhost:5173` and the Worker with `cf dev` on `localhost:8787`. Vite forwards `/api` to the Worker. D1 runs locally.

The Worker config is `apps/api/cloudflare.config.ts`. Build settings, such as the assets folder, are in `apps/api/wrangler.config.ts`. `cf` writes generated files to `.cloudflare/` (git-ignored).

| Command | Does |
|---|---|
| `pnpm build` | Builds the web app, then the Worker with `cf build` |
| `pnpm --filter @wayline/api exec cf deploy --dry-run` | Checks the deploy without uploading |
| `pnpm --filter @wayline/api exec cf workers types` | Writes `Env` and runtime types. `typecheck` runs it. |

## Providers in development

Local development and tests never call external APIs by default. There are two kinds of fakes.

| Kind | Where | Use |
|---|---|---|
| Recorded fixtures | `packages/providers/fixtures/` | Adapter parsing tests only |
| `FakeRouting`, `FakeWeather` | `packages/providers` | Deterministic data for any input. Planner, API and UI tests, local dev. |
| `fakeBrouterLeg` | `packages/providers` | Straight-line legs in BRouter's format. Default router of the Worker. |

`PROVIDERS=live` switches to the real APIs.

Routing switches:

| Setting | Where | Effect |
|---|---|---|
| `BROUTER_URL=http://localhost:17777` | `apps/api/.dev.vars` | The Worker routes with the local BRouter instead of `fakeBrouterLeg`. |
| `VITE_ROUTING=api` | `apps/web/.env.local` | The web app routes through `POST /api/route` (`ApiRouting`) instead of `FakeRouting` on the route network. The generator routes the chosen proposals too. |

Weather:

| Setting | Where | Effect |
|---|---|---|
| `VITE_WEATHER=open-meteo` | `apps/web/.env.local` | The web app asks Open-Meteo (`OpenMeteoWeather`). Default: `FakeWeather`. The deploy sets it. |

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

Real routing end to end:

```sh
pnpm brouter                                         # terminal 1
echo "BROUTER_URL=http://localhost:17777" > apps/api/.dev.vars
echo "VITE_ROUTING=api" > apps/web/.env.local
pnpm --filter @wayline/api db:migrate
pnpm dev                                             # terminal 2
curl -X POST localhost:8787/api/route -H 'content-type: application/json' \
  -d '{"from":[10.8873,49.8917],"to":[9.9356,49.7913],"profile":"touring"}'
```

The response header `X-Cache` says `HIT` or `MISS`.

## Local BRouter

A local BRouter covers Baden-Württemberg, Hessen and Bayern. It needs Docker.

```sh
pnpm brouter    # BRouter on localhost:17777
```

- First run downloads four segment files (about 760 MB) into `.cache/brouter/segments4/`. Later runs skip them.
- BRouter runs with `docker compose` from `infra/brouter/`. The image pins BRouter 1.7.10.
- Our presets are BRouter profiles in `infra/brouter/profiles/`: `touring`, `fast`, `scenic`, `quiet`. Each is `trekking` with a few switches changed. A restart picks up changes.
- To update the segments, delete `.cache/brouter/segments4/` and run again.
- BRouter fixtures are recorded from the local BRouter only: `node packages/providers/fixtures/brouter/record.js`.

Check it:

```sh
curl "http://localhost:17777/brouter?lonlats=10.8873,49.8917|9.9356,49.7913&profile=touring&alternativeidx=0&format=geojson"
```

## Tests

| Package | What |
|---|---|
| `domain`, `planner` | Unit tests. Stage cutting, scoring, recompute rules, schema migrations. |
| `providers` | Parsing against recorded fixtures. |
| `api` | Worker endpoints with fake providers and local D1. |
| `ui` | Contrast check over token pairs. |

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
| Pull request | Lint, typecheck, test |
| Push to `main` | Lint, typecheck, test, then deploy (`docs/12-deploy.md`) |
| Monthly or manual | Data pipeline |

## Later

- Playwright tests for 2–3 main flows
