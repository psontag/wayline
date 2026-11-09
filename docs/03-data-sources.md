# Data sources

All limits are for free plans. Check them again before relying on them. They change.

## Summary

| Data | Source | Cost | Called from |
|---|---|---|---|
| Cycling routes, towns, stations | OpenStreetMap (Geofabrik extracts) | Free | Pipeline |
| Routing | Our router on OpenStreetMap ways | Free | Browser |
| Weather | Open-Meteo | Free | Browser |
| Hotels | OpenStreetMap | Free | Pipeline |
| Ratings, prices, booking | Booking.com search link | Free | Browser (link only) |
| Train connections | db.transport.rest, bahn.de link | Free | Browser |
| Train times from home | gtfs.de timetables (CC BY 4.0) | Free | Pipeline |
| Areas | BKG GE250 tourism regions (dl-de/by-2.0) | Free | Pipeline |
| Map tiles | OpenFreeMap | Free | Browser |
| Hosting | Cloudflare | Free | — |

## OpenStreetMap

Used for:

- Signed cycling routes: route relations with `route=bicycle` (EuroVelo, D-Routen, long-distance and regional routes).
- Towns and villages: `place=*`.
- Train stations: `railway=station`, `railway=halt`.
- Hotels: `tourism=hotel`, `tourism=guest_house`, `tourism=motel`.
- Scenic features: rivers, lakes, forests, nature parks, viewpoints.

The pipeline downloads the Geofabrik extracts of the 16 German states. It builds static files that are deployed as static assets. No runtime calls to Overpass. Size and build time: `pipeline/README.md`.

License: ODbL. The map must show OSM attribution.

## Routing

The browser routes on the routing tiles of the dataset (`packages/router`, tiles in `pipeline/README.md`). No server and no request limits.

- Costs follow BRouter's trekking profile. Our presets are BRouter profiles in `packages/router/profiles/`, ported to `packages/router/src/cost.ts`.

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
- Its `bike` option is not used: the list marks connections that need a bike reservation instead of hiding them.

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

Bikes:

- Connections are not filtered by bike. An IC, ICE, EC, Railjet, night train, TGV, Flixtrain or FlixBus leg gets an **R**: the bike needs a reservation. The rule reads the line names, so it works with every provider.
- When some connections have at most one change, the list leaves out the others.
- A note under the list links to bahn.de to book the bike space.

### Train times from home: gtfs.de

The live API answers one trip at a time. Train times from home to every station come from the timetables instead, in the pipeline (`pipeline/reach.py`).

| Feed | Content | URL |
|---|---|---|
| `rv_free` | Regional trains, and some long-distance trains | `download.gtfs.de/germany/rv_free/latest.zip` |
| `fv_free` | Long-distance trains (IC, ICE, EC) | `download.gtfs.de/germany/fv_free/latest.zip` |

- License: CC BY 4.0, data from DELFI e.V. Credit "gtfs.de, DELFI e.V." wherever the times show.
- Updated weekly. A feed covers about a month from its date. The pipeline downloads it again after 7 days.
- Some regional lines are missing, for example RB 27 at Königswinter.
- No bike data. Long-distance trains count as "bike reservation needed".
- The app loads `reach/<station>.json` from the manifest for the home station. The Where step uses the out times of the first day's day type. The credit shows in the map attribution while the layer is on.
- Journeys up to 12 hours, so every area of Germany has a time with at most 2 changes. Only the Ostfriesische Inseln (ferry) have none.

## Areas: BKG Reisegebiete

The Where step splits Germany into the official tourism regions ("Reisegebiete"), from BKG "Gebietseinheiten 1:250 000" (GE250), layer RG250. `pipeline/areas.py` writes `areas.json`.

- Download: `daten.gdz.bkg.bund.de/produkte/sonstige/ge250/aktuell/ge250.utm32s.shape.zip` (38 MB). Shapefile in ETRS89 / UTM 32N. Updated about once a year.
- 146 areas, Berlin, Bremen and Hamburg included. Keys `SN_RG`, names `RG`.
- License: Datenlizenz Deutschland – Namensnennung 2.0. Credit "© BKG (year of download) dl-de/by-2-0" with a link to the sources list, and say that the outlines are simplified. The text is in `areas.json` (`attribution`).
- Train time per area: the fastest station of the area in the reach file.

## Map

- MapLibre GL JS with OpenFreeMap tiles. Free, no key.
- Overlay of signed cycling routes as vector tiles in the static assets (`pipeline/lines.py`).
- Stations along each signed route, with a simplified line for low zoom, in `route-stations.json` (`pipeline/route_stations.py`). Regional route lines only show from zoom 8.

## Cloudflare free plan

| Service | Limit |
|---|---|
| Workers | 100,000 requests per day, 10 ms CPU per request |
| D1 | 5 GB, 5 million rows read and 100,000 rows written per day |
| Static assets | Free and unlimited requests. 20,000 files, 25 MiB per file. |
| KV | 1,000 writes per day (not used) |
| Access | Free up to 50 users |
