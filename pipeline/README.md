# Pipeline

Builds the route network and places for Baden-Württemberg, Hessen and Bayern from OSM data and the Copernicus DEM.

## Build

```sh
pnpm data:build
```

- Needs [uv](https://docs.astral.sh/uv/), Python 3.12 and [tippecanoe](https://github.com/felt/tippecanoe) (`brew install tippecanoe`, `apt install tippecanoe`). `build.sh` installs the packages from `requirements.txt` into `pipeline/.venv`.
- Downloads missing inputs to `pipeline/cache/` (gitignored, about 3 GB): Geofabrik extracts of the three states and Copernicus GLO-30 tiles N47–N51, E007–E013.
- Writes `apps/web/public/data/<version>/` and `apps/web/public/data/latest.json` (gitignored). The version is `south-<date of the extracts>`.
- Takes about 8 minutes and up to 5.5 GB of memory on a laptop. Reading the extracts takes 7 of the 8 minutes: 5 for routes and places, 2.5 for scenery. The results are cached, so the next build takes 1 minute.
- `pnpm data:build --states hessen` builds one state.

Output (October 2026):

| | |
|---|---|
| Route network | 68,000 nodes, 90,000 edges, 87,000 km |
| Tiles | 87 files of 0.5°, 39 MiB (6.6 MiB gzipped), median 0.4 MiB, largest 2.4 MiB |
| `places.json` | 4.1 MiB (1 MiB gzipped): 16,800 towns, 2,500 stations, 15,700 hotels |
| Route lines | 1,980 files (768 empty), 4 MiB, largest 54 KiB |
| `routes.json` | 0.4 MiB: 3,800 routes |

A trip around Heidelberg needs about 6 tiles, 4.4 MiB (0.7 MiB gzipped).

## Route lines

The map draws the signed routes from vector tiles, not from the network tiles.

- `lines/{z}/{x}/{y}.pbf`: one layer `routes`, zoom 5–11. MapLibre stretches zoom 11 for closer views.
- Inside the bounds in the manifest every tile exists, empty if no route runs there. The host answers a missing file with the app page, which the map can't read.
- Each line is a signed edge with `network` (its class) and `routes` (route ids as `|1|5|`, main route first).
- EuroVelo and national edges are in every zoom, regional ones from zoom 9, local ones from zoom 11. Every line stays in; neighbours are joined.
- `routes.json`: id, name, class, length and bbox of each route. Routes are keyed by name, so the relations of one route (e.g. one per state) count as one.
- A route's class is the best class of its OSM relations.
- `python lines.py <data_dir>` rebuilds them for a built dataset. Without the OSM relations, a route's class is the one with the most km. The Oberfranken mock is built this way.

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
- A state extract holds only the part of a relation inside the state. `scenery.py` joins the ways of such relations across the states. Areas that reach outside the region are dropped, except water: its open outline is closed with a straight line. So the Bodensee covers its German side.

Mean share per edge km, October 2026:

| forest | water | vineyard | nature |
|---|---|---|---|
| 0.43 | 0.17 | 0.01 | 0.31 |

Sights within 500 m, share of edges:

| 0 | 1 | 2–4 | 5–9 | 10+ |
|---|---|---|---|---|
| 63% | 18% | 13% | 4% | 2% |

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
| `region.py` | States, DEM tiles and tile size |
| `check_area.py` | Checks the data around a station |
| `subset.py` | Copies the tiles of a bbox into a small dataset |

## Checks

```sh
cd pipeline
.venv/bin/python check_area.py ../apps/web/public/data/<version> "Heidelberg Hauptbahnhof" 80 Mosbach Michelstadt Eppingen
```

Prints how much of the network within 80 km is connected to the station, the towns with hotels, and the best path to each named town.

## Test data

`apps/web/public/data/mock/heidelberg/` holds the 6 tiles around Heidelberg (8.0–9.5° E, 49–50° N) and the places in them. Tests use it. To refresh it:

```sh
cd pipeline
.venv/bin/python subset.py ../apps/web/public/data/<version> ../apps/web/public/data/mock/heidelberg 8.0 49.0 9.49 49.99 Heidelberg
```

## Mock data

`apps/web/public/data/mock/oberfranken/` comes from the spike scripts in `spike/`. To regenerate it:

```sh
cd pipeline
.venv/bin/python extract.py oberfranken-latest.osm.pbf extract.json
.venv/bin/python spike/export_mock.py extract.json <dem-dir> ../apps/web/public/data/mock/oberfranken
```

- `oberfranken-latest.osm.pbf` is from Geofabrik.
- `<dem-dir>` holds the Copernicus GLO-30 tiles N49–N50, E010–E012.
