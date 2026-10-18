# Development

## Tools

| Tool | Use |
|---|---|
| pnpm | Package manager, monorepo workspaces |
| Vite | Web app dev server and build |
| Wrangler | Run and deploy the Worker, local D1 |
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
