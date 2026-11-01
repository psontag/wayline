# Deploy

Every push to `main` deploys the app to `https://wayline-api.<subdomain>.workers.dev`, behind Cloudflare Access. The `deploy` job in `.github/workflows/ci.yml` does it all. It can also be started by hand (Actions → CI → Run workflow).

## What the pipeline does

1. Lint, typecheck, test.
2. Builds the route data with `pnpm data:build`. The result is cached per month and pipeline version, so most deploys skip it.
3. Runs `apps/api/scripts/setup-cloudflare.ts`. It finds or creates, by name:
   - the D1 database `wayline`
   - the tunnel `wayline-brouter`
   - the Workers VPC service `wayline-brouter`: the Worker's way through the tunnel to `brouter:17777`
   - the workers.dev subdomain, if the account has none
   - the one-time PIN login method (a code by email)
   - the Access app on the workers.dev address, with the emails from `ACCESS_EMAILS`, straight to the one-time PIN login, 30-day sessions
4. Applies D1 migrations.
5. Builds and deploys the Worker with the ids from step 3 (`cloudflare.config.ts`).
6. Checks that the app asks for a login. The deploy fails if it answers without one.

Running it again changes nothing unless something differs. Nothing is ever deleted.

## Caching

`apps/web/public/_headers` sets the cache headers for static files.

| Path | Cache |
|---|---|
| `/data/<version>/*` | One year, `immutable`. The version changes with every data build or pipeline change. |
| `/data/latest.json` | Default: checked on every visit. |
| `/data/mock/*` | Default. Committed and rebuilt in place. |

## One-time setup by the owner

These steps need a login, a card or a secret, so they can't be automated.

1. **Cloudflare account** with two-factor login.
2. **Zero Trust**: open Zero Trust in the dashboard, pick a team name and the Free plan. It asks for a card but charges nothing. Turn on billing email alerts under Billing.
3. **Deploy token**: My Profile → API Tokens → Create Custom Token, account level only, no zones:

   | Permission | Level |
   |---|---|
   | Workers Scripts | Edit |
   | D1 | Edit |
   | Account Settings | Read |
   | Cloudflare Tunnel | Edit |
   | Connectivity Directory | Admin |
   | Access: Apps and Policies | Edit |
   | Access: Organizations, Identity Providers, and Groups | Edit |
   | Workers Tail | Read |

4. **GitHub** → Settings → Secrets and variables → Actions:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - `ACCESS_EMAILS`, as a variable or a secret: comma separated, e.g. `me@example.com,friend@example.com`
5. **Debug token** for this machine, read only:

   | Permission | Level |
   |---|---|
   | Workers Tail | Read |
   | Workers Observability | Read |
   | D1 | Read |
   | Account Analytics | Read |
   | Account Settings | Read |
   | Cloudflare Tunnel | Read |

   Save it in `.cloudflare.env` in the repo root (git-ignored):

   ```
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```

Then run the workflow once.

## Routing online

The Worker can't run BRouter. It reaches the BRouter on the owner's machine through the tunnel:

```
Worker → VPC service binding (BROUTER) → tunnel → cloudflared → brouter:17777
```

- `pnpm brouter` starts BRouter and, with `.cloudflare.env`, cloudflared. It fetches the tunnel token with the debug token.
- The tunnel has no public hostname. Only the Worker can reach BRouter.
- When the machine is off, new routes fail with `PROVIDER_UNAVAILABLE`. Saved trips and cached legs still work.

## Users

- Add or remove someone: change `ACCESS_EMAILS` and run the workflow.
- Login is a one-time PIN by email.
- Zero Trust Free allows up to 50 users.

## Free tier

Only products that stop at their free limit: Workers, static assets, D1, Access, Tunnel, Workers VPC (free in beta). Never enable the Workers Paid plan, R2, Containers, Images, Stream or Argo. The deploy token can't change billing.

## Debugging

With `.cloudflare.env`:

```sh
set -a; . ./.cloudflare.env; set +a
pnpm --filter @wayline/api exec wrangler tail wayline-api
```

Workers Logs are on (`observability` in `cloudflare.config.ts`) and searchable in the dashboard.
