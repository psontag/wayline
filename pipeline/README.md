# Pipeline

Builds the route network and places for Germany from OSM data and the Copernicus DEM.

## Build

```sh
pnpm data:build
```

- Needs [uv](https://docs.astral.sh/uv/), Python 3.12, [osmium-tool](https://osmcode.org/osmium-tool/) (`brew install osmium-tool`, `apt install osmium-tool`) and [tippecanoe](https://github.com/felt/tippecanoe) 2.79 or newer (`brew install tippecanoe`; the Ubuntu package is too old, so build it from source as in `.github/workflows/ci.yml`). `build.sh` installs the packages from `requirements.txt` into `pipeline/.venv`. `uv run` in `pipeline/` uses that venv.
- Downloads missing inputs to `pipeline/cache/` (gitignored, about 8 GB): the Geofabrik extract of Germany (4.5 GB), Copernicus GLO-30 tiles N47–N55, E005–E015 (2.8 GB) the gtfs.de timetables (12 MB, again after 7 days) and the BKG GE250 areas (38 MB).
- In a worktree, `pipeline/cache` is a link to the main checkout (`pnpm setup:worktree`). After the build, the new dataset moves to the main checkout and is linked back.
- Writes `apps/web/public/data/<version>/` and `apps/web/public/data/latest.json` (gitignored). The version is `de-<date of the extracts>-<pipeline hash>`. The hash covers `pipeline/*.py` and `requirements.txt`, so a pipeline change gives a new version.
- First filters the OSM file with osmium-tool to what the pipeline reads (`OSM_FILTER` in `build.py`): 4.5 to 1.5 GB.
- Takes about 20 minutes plus the download, and up to 6 GB of memory on a laptop. The filtered file and the extracts are cached, so the next build takes about 4.5 minutes.
- `pnpm data:build --area hessen` builds one state.

| Step | Minutes | Memory |
|---|---|---|
| Filter | 1 | 2.5 GB |
| Routing extract | 7.9 | 6.0 GB |
| Routing tiles | 2.3 | 4.4 GB |
| Scenery extract | 4.4 | 5.4 GB |
| Route extract | 2 | 5.5 GB |
| Graph, export and lines | 2.3 | 4.6 GB |
| Route stations | 0.1 | 0.5 GB |
| Areas | 0.1 | 0.3 GB |

Output (November 2026):

| | |
|---|---|
| Route network | 152,000 nodes, 205,000 edges, 212,000 km, of which 1,650 km connectors |
| Tiles | 226 files of 0.5°, 19.5 MiB (9.2 MiB gzipped), largest 0.21 MiB gzipped |
| Place tiles | 229 files, 9.8 MiB (2.3 MiB gzipped), largest 143 KiB: 39,300 towns, 5,900 stations, 38,000 hotels |
| `search.json` | 2.8 MiB (0.7 MiB gzipped): 31,800 towns and 5,900 stations on the network |
| Route lines | 5,000 files (1,493 empty), 15 MiB, largest 206 KiB |
| `routes.json` | 1.8 MiB: 16,300 routes |
| `reach/<station>.json` | 1.3 MiB (0.35 MiB gzipped) per home station, 11 s: 5,200 stations within 12 h of Karlsruhe |
| `route-stations.json` | 0.6 MiB (0.3 MiB gzipped), 7 s: 547 routes in 570 parts, 10,000 stations |
| `areas.json` | 0.5 MiB (0.36 MiB gzipped), 3 s: 146 areas, 5,900 stations |

A 200 km trip loads up to about 110 tiles, about 12 MiB (6 MiB gzipped).

## Route network

`graph.py` builds the network from the signed cycle routes.

- A dead end gets a connector to the nearest node of another part within 1 km.
- `routing.route_pairs` routes each connector on the routing graph with the touring way costs, in a child process. The connector gets the length, shape and main surface of that way.
- A connector with no way within 4× the straight line (at least 2 km of cost) stays a straight line of 1.3× the distance. In Hessen 92 % of connectors are routed.

## Network tiles

`tiles/<x>_<y>.bin` hold the route network in tiles of 0.5°, gzipped. The manifest lists them under `tiles` with `format: 1`. `export.pack_tile` writes them, `packages/providers/src/networkTile.ts` and `export.read_tile` read them. A tile holds its nodes, every edge that touches one of them, and the far nodes of those edges.

All numbers are little-endian. Coordinates are degrees × 10⁵. Shares are × 1000. "Delta" means each value minus the one before, the first as is.

| Field | Type | Count |
|---|---|---|
| `WNT1` | 4 bytes | |
| Nodes n, edges m, points p, route refs r, name bytes b | u32 | 5 |
| Names: route and place names, UTF-8, joined by `\n` | bytes | b |
| Node ids, delta | i32 | n |
| Lon, delta | i32 | n |
| Lat, delta | i32 | n |
| Kind: 0 junction, 1 town, 2 station | u8 | n |
| Hotels | u16 | n |
| Name (index in names), −1 for none | i32 | n |
| Edge ids, delta | i32 | m |
| From node id | i32 | m |
| To node id | i32 | m |
| Length in m | u32 | m |
| Paved share | u16 | m |
| Surface shares paved, gravel, unpaved | u16 | 3 × m |
| Network: 0 icn, 1 ncn, 2 rcn, 3 lcn, 4 connector | u8 | m |
| Score | u16 | m |
| Ascent, descent in m | u16 | 2 × m |
| Scenery forest, water, vineyard, nature (shares) and sights (count), 65535 for none | u16 | 5 × m |
| Routes per edge | u8 | m |
| Points per edge | u32 | m |
| Routes (index in names), edge by edge | u32 | r |
| Lon of each point, delta | varint | p |
| Lat of each point, delta | varint | p |
| Elevation in m of each point, delta | varint | p |

Varint: the value zigzagged (0, −1, 1, −2 … as 0, 1, 2, 3 …), 7 bits per byte, low bits first, high bit set on all but the last byte.

Germany: 226 tiles, 19.5 MiB (9.2 MiB gzipped). Hessen: 25 tiles, 1.5 MiB (0.7 MiB gzipped).

## Route lines

The map draws the signed routes from vector tiles, not from the network tiles.

- `lines/{z}/{x}/{y}.pbf`: one layer `routes`, zoom 5–11. MapLibre stretches zoom 11 for closer views.
- Inside the bounds in the manifest every tile exists, empty if no route runs there. The host answers a missing file with the app page, which the map can't read.
- Each line is a signed edge with `network` (its class) and `routes` (route ids as `|1|5|`, main route first).
- EuroVelo and national edges are in every zoom, regional ones from zoom 8, local ones from zoom 11. Every line stays in; neighbours are joined.
- `routes.json`: id, name, class, length and bbox of each route. Routes are keyed by name, so the relations of one route (e.g. one per state) count as one.
- A route's class is the best class of its OSM relations.
- `uv run lines.py <data_dir>` rebuilds them for a built dataset. Without the OSM relations, a route's class is the one with the most km. The Oberfranken mock is built this way.

## Route stations

`route_stations.py` writes `route-stations.json`: the stations along each signed route, for the route shelf on New trip. Format in `RouteStationsFile` in `packages/domain/src/geodata.ts`.

- Routes are grouped by the clean names of `packages/planner/src/generate/routeCatalog.ts`, so the sections of a route count as one. `clean_name` is a copy, tested on the same cases (`routeNames.json`).
- Only international, national and regional routes of 50 km or more.
- Main line: per connected piece of a route, the shortest path between its two nodes farthest apart in a straight line. So a route on both banks of a river follows one bank. A loop gives half of it.
- Pieces of 5 km or more with ends within 5 km are joined, the gap counted as km. Pieces further apart become parts of their own, e.g. EuroVelo 15 has three.
- Each part starts at its south-west end. Stations within 2 km of the line get the km at their nearest point on it.
- Length and scenery shares come from the edges of the line. Ascent comes from the elevation along it, counting only rises of more than 10 m, the mean of both ways. The edges' own ascent adds up DEM noise: Neckartal-Radweg 10 m per km instead of 4.
- The line is simplified to 300 m for the map. Regional route lines only show from zoom 8, too close for the Where step.
- `uv run route_stations.py <data_dir>` adds it to a built dataset.

## Train reach

`reach.py` writes `reach/<station>.json`: train times from home to every station and back. Source and windows in `docs/03-data-sources.md`.

- Journeys up to 12 hours and 2 changes.
- Saturday, from Karlsruhe, the fastest station per area: with at most 1 change, 9 areas have no time (Erzgebirge, Vogtland, Nordsee, Holsteinische Schweiz, Ostfriesische Inseln, Lahntal, Bliesgau, Rhön (Bayern), Inn-Salzach). With 2 changes only the Ostfriesische Inseln have none: they need a ferry.
- 950 of 5,900 stations have no time. Most need 3 changes, 425 are not in the timetables.

## Areas

`areas.py` writes `areas.json`: the 146 tourism regions of BKG GE250 (RG250) with their stations and signed routes, for the Where step. Format in `AreasFile` in `packages/domain/src/geodata.ts`.

- Reads the shapefile from the zip and converts UTM 32N to lon/lat itself (Krüger series), so no GIS library is needed.
- Outlines are simplified to 100 m. Each border between two junctions is simplified once, so neighbours still fit without gaps. Islands under 1 km² are left out.
- Short names for long or odd official names (`SHORT`). Both Rhön areas get their state.
- Stations: inside the simplified outline, or the nearest area within 2 km for stations at the border or coast.
- Routes: lines from `route-stations.json`, counted in 0.5 km steps. A route counts with 10 km or more in the area.
- `uv run areas.py <data_dir>` adds it to a built dataset.

## Scenery

Each edge has `scenery`: how much of it runs through forest, along water, through vineyards and in nature areas, and how many sights are near (`Scenery` in `packages/domain/src/geodata.ts`).

- `scenery.py` draws the areas and rivers of each class onto a grid of 50 m cells over the region.
- An edge's share of a class is the share of its points (every 50 m) on a cell of that class.
- Each class grows by a buffer, so edges next to a forest or along a river count too.

| Class | OSM tags | Buffer |
|---|---|---|
| `forest` | `landuse=forest`, `natural=wood` | 50 m |
| `water` | `waterway=river\|canal`, `natural=water` over 5 ha (not basins or wastewater) | 150 m |
| `vineyard` | `landuse=vineyard` | 100 m |
| `nature` | `leisure=nature_reserve`, `boundary=national_park`, `boundary=protected_area` with `protect_class` 1–4, and nature parks (`Naturpark` in name or `protection_title`) | none |
| `sights` | Named `historic=castle\|ruins\|monastery\|city_gate`, `tourism=attraction\|viewpoint\|museum` (nodes, and areas by their center) | counted within 500 m |

- Pillow draws areas about 25 m too large. The buffers above come on top.
- Landscape protection areas (`protect_class=5` without `Naturpark`) don't count. They cover about a third of the land.
- Nature parks are large and include towns, e.g. Heidelberg is in Geo-Naturpark Bergstraße-Odenwald.
- The extract holds only the part of a relation inside Germany. Areas that reach outside are dropped, except water: its open outline is closed with a straight line. So the Bodensee covers its German side.

Mean share per edge km, October 2026:

| forest | water | vineyard | nature |
|---|---|---|---|
| 0.43 | 0.17 | 0.01 | 0.31 |

Sights within 500 m, share of edges:

| 0 | 1 | 2–4 | 5–9 | 10+ |
|---|---|---|---|---|
| 63% | 18% | 13% | 4% | 2% |

## Routing tiles

`route/<x>_<y>.bin` and `route/<x>_<y>.geo.bin` hold all bikeable ways for the router in the browser (#81). `routing.py` builds them, the manifest lists them under `routing`.

- Bikeable: `highway` of a road, track, path or cycleway, or any way with `bicycle=yes|designated|permissive|dismount`. Not `bicycle=no|private|use_sidepath`, `access=no|private`, steps or areas. Ferries (`route=ferry`) unless `bicycle=no`.
- Ways split at junctions into edges. Only the largest connected part is kept.
- An edge is in the tile of each of its ends. Tiles are 0.25°.
- Elevation: the DEM at each point, and smoothed over 50 m samples (±4) for the profile.
- Descent per edge and direction: the DEM at each point with a 10 m dead band, minus 1.5 % of the length (like BRouter's `downhillcutoff`).
- Shape points: inner points of a way more than 1.5 m off the line of their neighbors.
- Estimates for the scenic and quiet profiles, like BRouter's `estimated_*_class` tags. Class 0 is none, 1–6 is low to high.

| Class | From |
|---|---|
| Forest | Share of the edge on the `forest` scenery layer, in sixths |
| Water | Same with the `water` layer |
| Town | km of `residential` and `living_street` per km² within about 1.5 km: 1, 2, 4, 6, 8, 10 km start classes 1–6 |
| Traffic | Way type: `unclassified` 1, `tertiary` 3, `secondary` 4, `primary` 5, `trunk` 6, links one less. One more at town class 3 and up |
| Noise | Share of the edge within 100 m of a motorway, trunk or primary road, in sixths |

Germany (November 2026): 17.0 M nodes, 21.2 M edges, 2.3 M km, 854 tiles. Search parts 180 MiB, geometry parts 125 MiB gzipped, largest tile 1.4 MiB. A 230 km trip routed in 10 km legs loads about 6 MiB.

Both files are gzipped. All numbers are little-endian. Coordinates are degrees × 10⁶. "Delta" means each value minus the one before, the first as is.

Search part (`.bin`):

| Field | Type | Count |
|---|---|---|
| `WRT2` | 4 bytes | |
| Nodes n, edges m | u32 | 2 |
| Node ids, ascending, delta | i32 | n |
| Lon, delta | i32 | n |
| Lat, delta | i32 | n |
| From node (index in this tile), delta | i32 | m |
| To node (index in this tile) | i32 | m |
| Length in m | u32 | m |
| Attributes | u16 | m |
| Descent from → to in dm | u16 | m |
| Descent to → from in dm | u16 | m |
| Estimates: forest bits 0–2, water 3–5, town 6–8, traffic 9–11, noise 12–14 | u16 | m |

Node ids are the same in all tiles, so tiles join at shared nodes. Ids follow the tiles, so ids in a tile are close.

Attributes:

| Bits | Value |
|---|---|
| 0–4 | Way type: index in `routing.highways` of the manifest (`ferry` for ferries), 31 for others |
| 5–7 | `tracktype` grade 1–5, 0 for none |
| 8 | Paved (`surface=paved\|asphalt\|concrete\|paving_stones\|sett` or `smoothness=excellent\|good`) |
| 9 | Unpaved, as BRouter's trekking profile |
| 10 | Bike: bike lane, `bicycle=yes\|permissive\|designated`, bicycle road or `lcn=yes` |
| 11 | On a signed cycle route |
| 12 | Allowed from → to |
| 13 | Allowed to → from |

Geometry part (`.geo.bin`), edges in the same order:

| Field | Type | Count |
|---|---|---|
| `WRG1` | 4 bytes | |
| Edges m, shape points p | u32 | 2 |
| Lon of each shape point, delta (first of an edge: to its from node) | i32 | p |
| Lat, same | i32 | p |
| Shape points per edge | u16 | m |
| Elevation in m: from node, shape points, to node of each edge | i16 | p + 2m |

## Train reach

`reach.py` finds the train time from each home station (`HOMES`, for now Karlsruhe Hbf) to every station and back, with range RAPTOR on the gtfs.de timetables (`docs/03-data-sources.md`).

| | |
|---|---|
| Day types | Weekday (Tue–Thu), Saturday, Sunday. Per type the date with the most trips, so holidays are not used. |
| Out | Leaving home 07:00–15:00, so half days count too |
| Back | Arriving home 15:00–22:00. A search backwards in time from home. |
| Changes | 0, 1 and 2, at least 5 minutes each |
| Longest | 7 hours |
| Bike reservation | IC, ICE and other long-distance trains: the `fv_free` feed, and operators in `LONG_DISTANCE` in `rv_free` |

Format in `ReachFile` in `packages/domain/src/geodata.ts`. Per station id: minutes with at most 0, 1 and 2 changes, the same by regional trains only, and a bit per change count for "needs a reservation". 5,450 of our 5,874 stations match a timetable stop (same name within 1.5 km, else the nearest within 300 m). The rest are missing from the free feeds.

`uv run reach.py <data dir>` adds the reach files to a built dataset.

## Files

| File | Does |
|---|---|
| `build.sh` | Sets up Python and runs `build.py` |
| `build.py` | Runs everything |
| `download.py` | Downloads the inputs |
| `extract.py` | Reads cycling routes, towns, stations and hotels from a PBF file |
| `scenery.py` | Reads forests, water, vineyards, nature areas and sights, and scores edges |
| `graph.py` | Builds the route graph (docs/05-trip-generation.md) |
| `dem.py` | Reads elevation from the DEM tiles |
| `export.py` | Writes nodes, edges and places in the format of `packages/domain/src/geodata.ts` |
| `lines.py` | Writes the vector tiles of the signed routes and `routes.json` |
| `routing.py` | Writes the routing tiles |
| `reach.py` | Writes the train times from home stations |
| `route_stations.py` | Writes the stations along the signed routes |
| `region.py` | States, DEM tiles and tile size |
| `check_area.py` | Checks the data around a station |
| `subset.py` | Copies the tiles of a bbox into a small dataset |

## Checks

```sh
cd pipeline
uv run check_area.py ../apps/web/public/data/<version> "Heidelberg Hauptbahnhof" 80 Mosbach Michelstadt Eppingen
```

Prints how much of the network within 80 km is connected to the station, the towns with hotels, and the best path to each named town.

## Tests

```sh
pnpm test:pipeline
```

- Ruff with bug rules only (`ruff.toml`). The code is not reformatted: a change to `pipeline/*.py` changes the data version.
- `tests/test_pipeline.py`, about 6 s:
  - `pack_tile` gives the bytes of `packages/providers/fixtures/17_98.bin`, which the app's tile reader is tested on.
  - `build.py` on `tests/fixtures/sample-latest.osm.pbf` (Bamberg, 1.6 MB) with a made-up DEM. No downloads, no osmium-tool, no route lines.
- To recut the sample, from the filtered Germany extract: `osmium extract -s complete_ways -b 10.84,49.86,10.97,49.94 cache/work/germany-filtered.osm.pbf -o tests/fixtures/sample-latest.osm.pbf`.

## Test data

`apps/web/public/data/mock/heidelberg/` holds the 6 tiles around Heidelberg (8.0–9.5° E, 49–50° N) as JSON, and the places in them. Tests use it. To refresh it:

```sh
cd pipeline
uv run subset.py ../apps/web/public/data/<version> ../apps/web/public/data/mock/heidelberg 8.0 49.0 9.49 49.99 Heidelberg
```

## Mock data

`apps/web/public/data/mock/oberfranken/` comes from the spike scripts in `spike/`. To regenerate it:

```sh
cd pipeline
uv run extract.py oberfranken-latest.osm.pbf extract.json
uv run spike/export_mock.py extract.json <dem-dir> ../apps/web/public/data/mock/oberfranken
```

- `oberfranken-latest.osm.pbf` is from Geofabrik.
- `<dem-dir>` holds the Copernicus GLO-30 tiles N49–N50, E010–E012.
