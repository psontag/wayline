# Data sources

All limits are for free plans. Check them again before relying on them. They change.

## Summary

| Data | Source | Cost | Called from |
|---|---|---|---|
| Cycling routes, towns, stations | OpenStreetMap (Geofabrik extracts) | Free | Pipeline |
| Routing | BRouter, OpenRouteService as fallback | Free | Worker |
| Weather | Open-Meteo | Free | Worker |
| Hotels | OpenStreetMap | Free | Pipeline |
| Ratings, prices, booking | Booking.com search link | Free | Browser (link only) |
| Train connections | bahn.de link | Free | Browser (link only) |
| Map tiles | OpenFreeMap | Free | Browser |
| Hosting | Cloudflare | Free | — |

## OpenStreetMap

Used for:

- Signed cycling routes: route relations with `route=bicycle` (EuroVelo, D-Routen, long-distance and regional routes).
- Towns and villages: `place=*`.
- Train stations: `railway=station`, `railway=halt`.
- Hotels: `tourism=hotel`, `tourism=guest_house`, `tourism=motel`.
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

## Hotels

Hotels come from OSM. Ratings, prices and availability come from Booking.com through a search link.

Google Places is not used. Its terms (section 3.2.3 (e)) forbid using Places data with or near a non-Google map, and Wayline uses MapLibre.

### OSM hotels

- Tags: `tourism=hotel`, `tourism=guest_house`, `tourism=motel`.
- The pipeline extracts them with name, location, stars (`stars=*`) and website if present.
- Stored on R2 with the other geodata. No runtime API calls.
- Hotels in OSM are fairly complete in Germany, but not everywhere.

### Booking.com links

No API. Booking.com's API is only for partners.

| Link | Prefilled |
|---|---|
| Per stop | Town, check-in and check-out dates, budget, minimum rating |
| Per hotel | Hotel name and town, dates |

Booking applies the rating and price filters. Wayline does not show ratings or prices itself.

Open: confirm which filters Booking's search URL supports.

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
