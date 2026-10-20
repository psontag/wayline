# Pipeline

Builds the route network and places for Baden-Württemberg, Hessen and Bayern from OSM data and the Copernicus DEM.

## Build

```sh
pnpm data:build
```

- Needs [uv](https://docs.astral.sh/uv/) and Python 3.12. `build.sh` installs the packages from `requirements.txt` into `pipeline/.venv`.
- Downloads missing inputs to `pipeline/cache/` (gitignored, about 3 GB): Geofabrik extracts of the three states and Copernicus GLO-30 tiles N47–N51, E007–E013.
- Writes `apps/web/public/data/<version>/` and `apps/web/public/data/latest.json` (gitignored). The version is `south-<date of the extracts>`.
- Takes about 6 minutes and up to 5.5 GB of memory on a laptop. Reading the extracts takes 5 of the 6 minutes. The results are cached, so the next build takes 1 minute.
- `pnpm data:build --states hessen` builds one state.

Output (October 2026):

| | |
|---|---|
| Route network | 68,000 nodes, 90,000 edges, 87,000 km |
| Tiles | 87 files of 0.5°, 32 MiB (6.4 MiB gzipped), median 0.3 MiB, largest 2 MiB |
| `places.json` | 4.1 MiB (1 MiB gzipped): 16,800 towns, 2,500 stations, 15,700 hotels |

A trip around Heidelberg needs about 6 tiles, 4 MiB (0.7 MiB gzipped).

## Files

| File | Does |
|---|---|
| `build.sh` | Sets up Python and runs `build.py` |
| `build.py` | Runs everything |
| `download.py` | Downloads the inputs |
| `extract.py` | Reads cycling routes, towns, stations and hotels from a PBF file |
| `graph.py` | Builds the route graph (docs/05-trip-generation.md) |
| `dem.py` | Reads elevation from the DEM tiles |
| `export.py` | Writes nodes, edges and places in the format of `packages/domain/src/geodata.ts` |
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
