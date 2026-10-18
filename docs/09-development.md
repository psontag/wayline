# Development

## Tools

| Tool | Use |
|---|---|
| pnpm | Package manager, monorepo workspaces |
| Vite | Web app dev server and build |
| Wrangler | Run and deploy the Worker, local D1 and R2 |
| Vitest | Unit and integration tests |
| Playwright | UI tests and screenshots |
| Storybook | Component development |
| ESLint, Stylelint, Prettier | Lint and format |
| GitHub Actions | CI, deploy, data pipeline |

## Local setup

```sh
pnpm install
pnpm dev        # web app and Worker
pnpm storybook
pnpm test
```

`pnpm dev` runs the web app with Vite and the Worker with `wrangler dev`. D1 and R2 run locally through Wrangler.

## Providers in development

Local development and tests never call external APIs by default. Every provider interface has a fake implementation that returns recorded responses.

| Mode | Providers | Use |
|---|---|---|
| `fake` | Recorded responses from `fixtures/` | Default for dev and all tests |
| `live` | Real APIs | Only when needed, set with `PROVIDERS=live` |

To record new fixtures, run a script in `live` mode for a given request. Fixtures are committed.

## Tests

| Package | What |
|---|---|
| `domain`, `planner` | Unit tests. Stage cutting, scoring, recompute rules. |
| `providers` | Adapters against fixtures. Decorators: cache, rate limit, fallback. |
| `api` | Worker endpoints with fake providers and local D1. |
| `ui` | Storybook stories, screenshots in light and dark. |
| `web` | Playwright tests for main flows with fake providers. |

## Environments

| Environment | Deployed from | Data |
|---|---|---|
| Local | — | Local D1 and R2, fake providers |
| Preview | Pull requests | Own D1 and R2, live providers with low limits |
| Production | `main` | Production D1 and R2, live providers |

Both deployed environments are behind Cloudflare Access.

## Secrets

- API keys are Worker secrets, set with `wrangler secret put`.
- Locally they go in `.dev.vars`. This file is git-ignored.
- Deploy credentials are GitHub Actions secrets.

## Database

D1 schema changes are SQL migration files in `apps/api/migrations/`. CI applies them before deploy.

## CI

On every pull request:

1. Format and lint
2. Type check
3. Unit and integration tests
4. Translation key check
5. Storybook screenshots and contrast check
6. Deploy preview

On merge to `main`: the same checks, then deploy to production.
