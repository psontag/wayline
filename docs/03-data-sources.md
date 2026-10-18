# Data sources

All limits are for free plans. Check them again before relying on them. They change.

## Summary

| Data | Source | Cost | Called from |
|---|---|---|---|
| Cycling routes, towns, stations | OpenStreetMap (Geofabrik extracts) | Free | Pipeline |
| Routing | BRouter, OpenRouteService as fallback | Free | Worker |
| Weather | Open-Meteo | Free | Worker |
| Hotels | Google Places API (New) | Free quota, then paid | Worker |
| Booking | Booking.com search link | Free | Browser (link only) |
| Train connections | bahn.de link | Free | Browser (link only) |
| Map tiles | OpenFreeMap | Free | Browser |
| Hosting | Cloudflare | Free | — |

## OpenStreetMap

Used for:

- Signed cycling routes: route relations with `route=bicycle` (EuroVelo, D-Routen, long-distance and regional routes).
- Towns and villages: `place=*`.
- Train stations: `railway=station`, `railway=halt`.
- Hotels without ratings, as fallback: `tourism=hotel`.
- Scenic features: rivers, lakes, forests, nature parks, viewpoints.

The pipeline downloads Geofabrik extracts (Germany first). It builds static files and uploads them to R2. No runtime calls to Overpass.

License: ODbL. The map must show OSM attribution.

## Routing

### BRouter

Main router. Best cycling profiles. Supports custom profiles, so we can write one for "paved preferred, some gravel OK".

- Public server: `brouter.de`. Run by one person.
- No published usage policy or rate limit. No guarantee.
- We must keep request volume low: cache every leg, use a strict rate limit.
- MIT license. A Docker image exists. Self-hosting is possible later if the public server is not enough.

Open: confirm that custom profiles and our request volume are fine for the public server.

### OpenRouteService

Fallback router. Has a built-in round trip option.

- Free plan with API key: 2,000 directions per day, 40 per minute.
- Cycling profiles: `cycling-regular`, `cycling-road`, `cycling-mountain`, `cycling-electric`.
- No custom profiles. Only predefined options.

## Weather: Open-Meteo

- Free for non-commercial use. Below 10,000 calls per day, 5,000 per hour, 600 per minute.
- Forecast up to 16 days. Hourly wind speed and direction.
- Several locations in one request. One call can cover a whole stage.
- No API key.

## Hotels: Google Places API (New)

Used to find hotels at stage ends and show their rating.

> **Open decision.** Google's terms (section 3.2.3 (e)) forbid using Places data with or near a non-Google map. Wayline uses a MapLibre map. Using Google Places requires a Google map or a different hotel source.

### Cost

Free quota is per SKU and per month:

| Tier | Free calls per month |
|---|---|
| Essentials | 10,000 |
| Pro | 5,000 |
| Enterprise | 1,000 |

The field mask sets the tier. `rating`, `userRatingCount` and `priceLevel` are Enterprise fields. So any search that returns ratings counts against the 1,000 limit.

Approach:

1. Search hotels in an area with IDs only (cheap tier).
2. Get ratings only for hotels the user actually sees.
3. Set a monthly budget cap in the Google Cloud console.

### Caching rules

Google's terms limit what we can store:

- `place_id`: may be stored without time limit.
- Latitude and longitude: up to 30 days.
- Other content (name, rating, photos): no general caching exception.

So: store place IDs per area long term. Store coordinates up to 30 days. Fetch details when needed and keep them only briefly.

Check the current Places API policies before implementing.

### Budget filter

Google's `priceLevel` is often missing for hotels. The budget filter is approximate. Real prices are on the booking site.

## Booking

Each hotel gets a Booking.com search link with name, place and dates filled in. No API. Booking.com's API is only for partners.

## Trains

Version 1:

- Stations come from OSM.
- Start and end points snap to stations.
- A link opens bahn.de with stations and date filled in.

Later: live connections with a bike filter. `db-vendo-client` / `v6.db.transport.rest` are community projects. Their state and bike support need checking.

## Map

- MapLibre GL JS with OpenFreeMap tiles. Free, no key.
- Overlay of signed cycling routes from our own R2 data.

## Cloudflare free plan

| Service | Limit |
|---|---|
| Workers | 100,000 requests per day, 10 ms CPU per request |
| D1 | 5 GB, 5 million rows read and 100,000 rows written per day |
| R2 | 10 GB, 1 million write and 10 million read operations per month |
| KV | 1,000 writes per day (not used) |
| Durable Objects | 100,000 requests per day |
| Access | Free up to 50 users |
