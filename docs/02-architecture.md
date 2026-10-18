# Architecture

Wayline runs on Cloudflare and in the browser. There are no servers to maintain. Everything is written in TypeScript.

## Overview

```
Browser (React SPA)
 ├─ UI: map, stage editor, elevation, weather
 ├─ Web Worker: planner (generation, stages, scoring, GPX)
 └─ calls → Cloudflare Worker (one hostname, behind Access)
              ├─ static assets: the SPA and geodata (/data/*)
              ├─ /api: routing, weather, trips
              └─ storage: trips and route legs in D1

GitHub Action (monthly or manual) → OSM data → geodata files → deploy
```

## Hosting

One Worker on one hostname, behind Cloudflare Access. It serves:

- the SPA as static assets
- `/api`
- `/data/*`: geodata as static assets

`workers.dev` and preview URLs are turned off.

## Split between browser and Worker

| | Browser | Worker |
|---|---|---|
| Role | UI and planner | Gateway, cache, storage |
| Calls external APIs | Never | Always |
| CPU work | Heavy (in a Web Worker) | Light |
| Cache | Per user (IndexedDB) | Shared (D1) |

Rules:

- All external API calls go through the Worker.
- Heavy computation runs in the browser. The free Workers plan allows only about 10 ms CPU time per request.
- The Worker returns raw provider responses. The browser parses them.

## Providers

Each provider adapter has two halves. Both live in `packages/providers`.

| Half | Runs in | Does |
|---|---|---|
| fetch | Worker | Calls the provider. Returns `{ provider, profileHash, raw }`. |
| parse | Browser | Turns `raw` into our domain types. |

| Data | Provider |
|---|---|
| Routing | BRouter |
| Weather | Open-Meteo |
| Hotels | OSM hotels in the static geodata |
| Route network | Preprocessed OSM data in the static geodata |

The planner only depends on interfaces from `packages/providers`.

## Caching

| Data | Shared cache | Browser cache | Key |
|---|---|---|---|
| Route leg | D1 table `legs` with `expires_at`. A daily Cron Trigger deletes expired rows. | IndexedDB | see below |
| Weather | none, the Worker passes requests through | IndexedDB, 2 h | 0.1° cell |
| Geodata | Static assets, cached at the edge | IndexedDB per dataset version | dataset version |

Leg keys:

- network legs: dataset version + node ids
- custom points: coordinates at 5 decimals
- all legs also carry the provider and a profile content hash

Weather: fetch the full forecast once per 0.1° cell.

Routes are built from legs between fixed points: stations, towns and junctions. Proposals share many legs, so most requests hit the cache.

## Request limits

The browser sends at most 3 routing requests at once.

## Errors

All API errors have one shape:

```ts
{ code, message, retryAfter? }
```

| Code | Meaning |
|---|---|
| `PROVIDER_UNAVAILABLE` | External provider failed or timed out |
| `RATE_LIMITED` | Too many requests. `retryAfter` in seconds. |
| `NOT_FOUND` | Unknown trip or file |
| `CONFLICT` | Trip changed since it was loaded |
| `INVALID` | Request failed validation |

## API

- zod schemas in `packages/domain`
- `@hono/zod-validator` in the Worker
- typed Hono client `hc<AppType>` in the web app

| Endpoint | Use |
|---|---|
| `GET /api/me` | Current user |
| `GET /api/trips` | Own and shared trips |
| `GET /api/trips/:id` | Load a trip |
| `PUT /api/trips/:id` | Save a trip. Fails with `CONFLICT` if `updatedAt` doesn't match. |
| `DELETE /api/trips/:id` | Delete a trip |
| `POST /api/route` | Route a leg |
| `GET /api/weather` | Forecast for a cell |
| `GET /data/*` | Geodata (static assets) |

## Geodata

A GitHub Action runs monthly or manually (`workflow_dispatch`). It loads OSM data (Geofabrik extracts), writes files to `apps/web/public/data/<version>/` and deploys. Each file must stay under 25 MiB, and all static assets under 20,000 files.

| File | Format |
|---|---|
| `manifest.json` | Points to the current dataset version |
| Route network graph | One compact file. Kept in IndexedDB per version. |
| Edge geometry, towns, stations, hotels | Tiled files per map area |
| Cycling route overlay | PMTiles |

## Auth and storage

- Cloudflare Access protects the app. Allowed users are an email list.
- The Worker verifies the `Cf-Access-Jwt-Assertion` JWT and takes `owner` from its email.
- Trips are stored in D1.
- The app checks the `shares` table for shared trips. Sharing works only if the friend is also on the Access list.

## Frontend data flow

- The planner runs in a Web Worker via Comlink. A new edit cancels the running job.
- TanStack Query keys are per stage. Old data stays visible while new data loads.
- Selected stage, selected proposal and map view live in URL search params.

## Repo layout

pnpm monorepo:

```
packages/
  domain/      types and zod schemas
  providers/   adapters (fetch and parse)
  planner/     trip logic, depends only on interfaces
  ui/          design tokens and components
apps/
  web/         React SPA (Vite), planner in a Web Worker
  api/         Hono on Cloudflare Workers
pipeline/      OSM data pipeline (GitHub Action)
```

- Cache code is platform-specific and lives in the apps.
- `domain` and `planner` have no DOM or Cloudflare types in their tsconfig. The compiler enforces the boundary.

## Mobile

- PWA first. Capacitor if needed.
- Auth sits behind an interface.
- Running the planner in a Worker needs the $5 Workers plan.

## Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript |
| Frontend | React, Vite |
| Routing (pages) | TanStack Router |
| Data loading | TanStack Query |
| Forms | TanStack Form with zod |
| Styling | Tailwind CSS v4, Radix UI, Lucide icons |
| Translation | i18next, react-i18next |
| Map | MapLibre GL JS via react-map-gl, OpenFreeMap tiles |
| Web Worker calls | Comlink |
| Geometry | Turf.js |
| API | Hono on Cloudflare Workers |
| Database | Cloudflare D1 |
| Auth | Cloudflare Access |
| Validation | zod |

## Free tier

Wayline stays on the Cloudflare free plan. The account has no payment method, so nothing can be billed.

- Only services that stop at their free limit: Workers, static assets, D1, Durable Objects, Access.
- No R2. It bills usage beyond its free allowance.
- Never subscribe to Workers Paid without setting billing notifications first.

## Later

- Custom domain
- OpenRouteService as fallback router (never used during generation)
- Rate limiter (Durable Object) and daily budget per provider
- Usage page (`/api/usage`)
