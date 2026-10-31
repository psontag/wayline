# Data sources

All limits are for free plans. Check them again before relying on them. They change.

## Summary

| Data | Source | Cost | Called from |
|---|---|---|---|
| Cycling routes, towns, stations | OpenStreetMap (Geofabrik extracts) | Free | Pipeline |
| Routing | BRouter | Free | Worker |
| Weather | Open-Meteo | Free | Browser |
| Hotels | OpenStreetMap | Free | Pipeline |
| Ratings, prices, booking | Booking.com search link | Free | Browser (link only) |
| Train connections | db.transport.rest, bahn.de link | Free | Browser |
| Map tiles | OpenFreeMap | Free | Browser |
| Hosting | Cloudflare | Free | — |

## OpenStreetMap

Used for:

- Signed cycling routes: route relations with `route=bicycle` (EuroVelo, D-Routen, long-distance and regional routes).
- Towns and villages: `place=*`.
- Train stations: `railway=station`, `railway=halt`.
- Hotels: `tourism=hotel`, `tourism=guest_house`, `tourism=motel`.
- Scenic features: rivers, lakes, forests, nature parks, viewpoints.

The pipeline downloads Geofabrik extracts (Germany first). It builds static files that are deployed as static assets. No runtime calls to Overpass.

License: ODbL. The map must show OSM attribution.

## Routing

### BRouter

Main router. Best cycling profiles. Supports custom profiles, so we can write one for "paved preferred, some gravel OK".

- Public server: `brouter.de`. Run by one person.
- No published usage policy or rate limit. No guarantee.
- Sends `Access-Control-Allow-Origin: *`. We still call it from the Worker.
- We must keep request volume low: cache every leg.
- Custom profiles may get temporary ids on the public server. If a profile is not found, the adapter uploads it again and retries once.
- MIT license. Development uses a local BRouter in Docker (`09-development.md`). Self-hosting in production is possible later if the public server is not enough.
- Our presets are BRouter profiles in `infra/brouter/profiles/`. The adapter asks for the profile with the preset's name.
- No route (e.g. a point outside the segments) is a 400 with a plain text reason. The adapter maps it to `INVALID`.

Open: email the operator about custom profiles and our request volume.

### OpenRouteService

Later, as a fallback router only.

- Free plan with API key: 2,000 directions per day, 40 per minute.
- No custom profiles. Only predefined options.

## Weather: Open-Meteo

- Free for non-commercial use. Below 10,000 calls per day, 5,000 per hour, 600 per minute.
- Forecast up to 16 days. Hourly wind speed and direction.
- Several locations in one request. One call can cover a whole stage.
- No API key. Sends CORS headers, so the browser calls it directly. The limit counts per user.
- No shared cache. The browser caches forecasts in IndexedDB for 2 hours.
- Hourly values: `temperature_2m`, `precipitation`, `precipitation_probability`, `wind_speed_10m`, `wind_direction_10m`. `timezone=auto` gives local times.

## Trains: db.transport.rest

- `v6.db.transport.rest`: a free community API in front of the Deutsche Bahn timetable. No key. Sends CORS headers, so the browser calls it directly.
- Limit: 100 requests per minute per user. It can be down or go away. Then the editor shows the bahn.de link only.
- Two calls per search: `/locations` finds the station id (kept in memory), `/journeys` finds 3 connections before the first day's start or after the last day's arrival.
- The editor looks up trains only when the user opens the list. Saved connections are stored on the trip.
- Booking stays on bahn.de. Each connection links to a bahn.de search at its time.

## Hotels

Hotels come from OSM. Ratings, prices and availability come from Booking.com through a search link.

Google Places is not used. Its terms (section 3.2.3 (e)) forbid using Places data with or near a non-Google map, and Wayline uses MapLibre.

### OSM hotels

- Tags: `tourism=hotel`, `tourism=guest_house`, `tourism=motel`.
- The pipeline extracts them with name, location, stars (`stars=*`) and website if present. Hotels without a name are left out.
- A hotel belongs to a stop within 2 km. The generator and the editor use the same rule.
- OSM has no prices. The budget uses kind and stars instead: `fitsBudget` in `packages/providers/src/osm/hotels.ts`. Hotels that fit the budget are picked and listed first.
- Deployed as static assets with the other geodata. No runtime API calls.
- Hotels in OSM are fairly complete in Germany, but not everywhere.

### Booking.com links

No API. Booking.com's API is only for partners.

Two links:

- **Per stop**: a search for the town, with dates, budget and a review score of 8+.
- **Per hotel**: a search around the hotel's location, nearest first. The hotel is on top if Booking lists it. Else the nearest places show. A search by hotel name sends Booking to its home page when the name doesn't match.

```
https://www.booking.com/searchresults.html
  ?ss=Kronach
  &checkin=2027-06-13&checkout=2027-06-14
  &group_adults=1&no_rooms=1
  &nflt=review_score%3D80%3Bprice%3DEUR-80-140-1

https://www.booking.com/searchresults.html
  ?ss=Gasthof%20Hirsch
  &latitude=50.24120&longitude=11.32850
  &dest_type=latlong&order=distance_from_search
  &checkin=2027-06-13&checkout=2027-06-14
  &group_adults=1&no_rooms=1
```

| Parameter | Meaning |
|---|---|
| `ss` | Town or hotel name |
| `latitude`, `longitude`, `dest_type=latlong` | Search around a point |
| `order=distance_from_search` | Nearest first |
| `checkin`, `checkout` | Stage date and next day |
| `group_adults`, `no_rooms` | 1 and 1 |
| `nflt` | Filters, joined with `;`: `review_score=80`, `price=EUR-<min>-<max>-1` |

Booking applies the rating and price filters. Wayline does not show ratings or prices itself. Booking has no public photos or details for a hotel.

### Hotel websites

`GET /api/site?url=` on the Worker checks a hotel's website:

- No answer, 404, 410 or 5xx: the site is gone. The editor hides the link.
- Bot blocks (401, 403, 429) count as working.
- The preview image comes from `og:image`, `twitter:image` or `itemprop="image"`.
- Answers are cached for a week. Lists check at most 8 hotels; map cards check on hover.

## Trains

Version 1:

- Stations come from OSM.
- Start and end points snap to stations.
- A link opens bahn.de with stations and date filled in.

bahn.de has no public docs for its link format. The link uses the fragment that bahn.de writes into its own search URL:

```
https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=Bamberg&zo=Coburg&hd=2027-06-12T08:00:00&hza=D
```

| Parameter | Meaning |
|---|---|
| `so`, `zo` | Start and destination as station names |
| `hd` | Date and time, local |
| `hza` | `D` departure, `A` arrival |
| `sts` | Set by bahn.de itself. Meaning unknown, kept as is. |

Without station ids (`soid`, `zoid`), bahn.de matches the names itself. Check by hand when the format breaks.

Later: live connections with a bike filter. `db-vendo-client` / `v6.db.transport.rest` are community projects. Their state and bike support need checking.

## Map

- MapLibre GL JS with OpenFreeMap tiles. Free, no key.
- Overlay of signed cycling routes as tiled files in the static assets.

## Cloudflare free plan

| Service | Limit |
|---|---|
| Workers | 100,000 requests per day, 10 ms CPU per request |
| D1 | 5 GB, 5 million rows read and 100,000 rows written per day |
| Static assets | Free and unlimited requests. 20,000 files, 25 MiB per file. |
| KV | 1,000 writes per day (not used) |
| Access | Free up to 50 users |
