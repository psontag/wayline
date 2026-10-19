# Development

## Tools

| Tool | Use |
|---|---|
| pnpm | Package manager, monorepo workspaces |
| Vite | Web app dev server and build |
| Wrangler | Run and deploy the Worker, local D1 |
| Docker | Local BRouter |
| Vitest | Unit and integration tests |
| ESLint, Prettier | Lint and format |
| GitHub Actions | CI, deploy, data pipeline |

## Local setup

```sh
pnpm install
pnpm dev        # web app and Worker
pnpm test
```

`pnpm dev` runs the web app with Vite and the Worker with `wrangler dev`. D1 runs locally through Wrangler.

## Providers in development

Local development and tests never call external APIs by default. There are two kinds of fakes.

| Kind | Where | Use |
|---|---|---|
| Recorded fixtures | `packages/providers/fixtures/` | Adapter parsing tests only |
| `FakeRouting`, `FakeWeather` | `packages/providers` | Deterministic data for any input. Planner, API and UI tests, local dev. |

`PROVIDERS=live` switches to the real APIs.

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

- API keys are Worker secrets, set with `wrangler secret put`.
- Locally they go in `.dev.vars`. This file is git-ignored.
- Deploy credentials are GitHub Actions secrets.

## Database

D1 schema changes are SQL migration files in `apps/api/migrations/`.

- Within one deploy, migrations are additive only. Destructive changes go in a later deploy.
- Never edit an applied migration.
- D1 Time Travel is the restore path.

## CI

| Trigger | Steps |
|---|---|
| Pull request | Lint, typecheck, test |
| Push to `main` | Lint, typecheck, test, build, `wrangler d1 migrations apply --remote`, deploy |
| Monthly or manual | Data pipeline |

## Later

- Playwright tests for 2–3 main flows
