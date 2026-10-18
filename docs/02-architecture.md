# Architecture

Wayline runs on Cloudflare and in the browser. There are no servers to maintain. Everything is written in TypeScript.

## Overview

```
Browser (React SPA)
 ├─ UI: map, stage editor, elevation, weather
 ├─ Web Worker: planner (generation, stages, scoring, GPX)
 └─ calls → Cloudflare Worker (API gateway)
              ├─ external APIs: routing, weather
              ├─ cache: Cache API, D1, R2
              ├─ storage: trips in D1
              └─ protected by Cloudflare Access

GitHub Action (weekly) → OSM data → static geodata files → R2
```

## Split between browser and Worker

| | Browser | Worker |
|---|---|---|
| Role | UI and planner | Gateway, cache, storage |
| Calls external APIs | Never | Always |
| CPU work | Heavy (in a Web Worker) | Light |
| Cache | Per user (memory, IndexedDB) | Shared by all users |

Rules:

- All external API calls go through the Worker. This gives one shared cache, one place for API keys and one place for rate limits.
- Heavy computation runs in the browser. The free Workers plan allows only about 10 ms CPU time per request.
- For routing, the Worker stores and returns raw provider responses. The browser parses them. This keeps Worker CPU time low.
- If the Worker CPU limit becomes a problem, the paid Workers plan ($5/month) removes it.

## Provider abstraction

Each external data type has an interface in our own domain types. Adapters translate between a provider's API and our types.

| Interface | Providers |
|---|---|
| `RoutingProvider` | BRouter, OpenRouteService |
| `WeatherProvider` | Open-Meteo |
| `LodgingProvider` | OSM hotels on R2 |
| `TransitProvider` | OSM stations, bahn.de links (live connections later) |
| `RouteNetworkSource` | Preprocessed OSM data on R2 |

Cross-cutting behaviour is added with decorators that implement the same interface:

```ts
const routing: RoutingProvider =
  new Cached(new RateLimited(new Fallback(brouter, ors)), store)
```

In the browser, the same interface is implemented by a client that calls the Worker:

```ts
const routing: RoutingProvider = new GatewayRouting(apiUrl)
```

The planner only depends on the interfaces. So we can:

- switch a provider by adding an adapter and changing the wiring in the Worker
- move the planner from the browser to a Worker without code changes
- swap cache stores

## Caching

Three cache levels:

1. **Browser**: memory and IndexedDB. Merges duplicate requests in flight.
2. **Worker Cache API**: free, fast, per data center. Entries can be evicted at any time.
3. **Durable storage**: R2 for large data (route geometry), D1 for small JSON (weather).

KV is not used. The free plan allows only about 1,000 writes per day.

In the browser, two layers have separate jobs:

- **Planner with `CacheStore`** caches provider data: route legs, weather.
- **TanStack Query** caches what the UI shows: trips from the API and derived stage data from the planner, keyed by the stored trip input.

Query never calls external providers. Provider data is cached only once.

UI state that should survive a reload, like the selected stage or map position, lives in URL search params (TanStack Router).

Cache keys contain the provider, profile version and schema version. Changing any of them creates new keys, so the cache never needs manual clearing.

| Data | Key | TTL |
|---|---|---|
| Route leg | provider, profile, rounded coordinates | 30 days |
| Weather | grid cell (~0.1°), date | 1–3 hours |
| Geodata | dataset version | permanent |

Routes are built from legs between fixed points: stations, towns and junctions in the cycling route network. Different trip proposals share many legs, so most requests hit the cache.

## Protecting external APIs

The Worker enforces per provider:

- **Rate limit**: a token bucket in a Durable Object.
- **Daily budget**: a request counter. When used up, only cached data is served, or the fallback provider is used.
- **Fallback**: if the main provider fails or is slow, use the next one.

## Geodata

A weekly GitHub Action loads OSM data (Geofabrik extracts) for signed cycling routes, towns, train stations and hotels. It writes FlatGeobuf or PMTiles files to R2 under a versioned path. The browser loads only the parts it needs for the current map area. No live calls to Overpass.

## Auth and storage

- Cloudflare Access protects the app. Allowed users are listed by email.
- Trips are stored in D1.
- Friends can view shared trips.

## Repo layout

pnpm monorepo:

```
packages/
  domain/      types and zod schemas
  providers/   interfaces, adapters, decorators
  cache/       CacheStore interface and implementations
  planner/     trip logic, depends only on interfaces
  ui/          design tokens and components
apps/
  web/         React SPA (Vite), planner in a Web Worker
  api/         Hono on Cloudflare Workers
pipeline/      OSM to R2 data pipeline (GitHub Action)
```

`domain` and `planner` must not import browser or Cloudflare APIs. A lint rule enforces this.

## Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript |
| Frontend | React, Vite |
| Routing (pages) | TanStack Router |
| Data loading | TanStack Query |
| Forms | TanStack Form with zod |
| Styling | Tailwind CSS v4, Radix UI, Lucide icons |
| Component docs | Storybook |
| Translation | i18next, react-i18next |
| Map | MapLibre GL JS, OpenFreeMap tiles |
| Geometry | Turf.js |
| API | Hono on Cloudflare Workers |
| Database | Cloudflare D1 |
| Files | Cloudflare R2 |
| Auth | Cloudflare Access |
| Validation | zod |
