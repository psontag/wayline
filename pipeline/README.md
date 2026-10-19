# Pipeline

Builds the route network and places for Baden-Württemberg, Hessen and Bayern from OSM data and the Copernicus DEM.

## Build

```sh
pnpm data:build
```

- Needs [uv](https://docs.astral.sh/uv/). It runs the scripts in a temporary environment with the packages from `requirements.txt`.
- Downloads missing inputs to `pipeline/cache/` (gitignored, about 3 GB): Geofabrik extracts of the three states and Copernicus GLO-30 tiles N47–N51, E007–E013.
- Writes `apps/web/public/data/<version>/` and `apps/web/public/data/latest.json` (gitignored). The version is `south-<date of the extracts>`.
- Takes about 5 minutes and up to 6 GB of memory on a laptop.
- `pnpm data:build --states hessen` builds one state.

Output (October 2026):

| | |
|---|---|
| Route network | 68,000 nodes, 90,000 edges, 87,000 km |
| Tiles | 87 files of 0.5°, 33 MiB (7 MiB gzipped), largest 2.1 MiB |
| `places.json` | 4.1 MiB (1 MiB gzipped): 16,800 towns, 2,500 stations, 15,700 hotels |

## Files

| File | Does |
|---|---|
| `build.py` | Runs everything |
| `download.py` | Downloads the inputs |
| `extract.py` | Reads cycling routes, towns, stations and hotels from a PBF file |
| `graph.py` | Builds the route graph (docs/05-trip-generation.md) |
| `dem.py` | Reads elevation from the DEM tiles |
| `export.py` | Writes nodes, edges and places in the format of `packages/domain/src/geodata.ts` |
| `region.py` | States, DEM tiles and tile size |
| `check_area.py` | Checks the data around a point |
| `subset.py` | Copies the tiles of a bbox into a small dataset |

## Checks

```sh
cd pipeline
uv run --python 3.12 --with-requirements requirements.txt check_area.py ../apps/web/public/data/<version> 8.6756 49.4037 80 "Heidelberg Hauptbahnhof"
```

Prints the stations near the point, whether the network within the radius is connected, and the towns with hotels.

## Test data

`apps/web/public/data/mock/heidelberg/` holds the tiles around Heidelberg for tests. To refresh it:

```sh
uv run --python 3.12 --with-requirements requirements.txt subset.py ../apps/web/public/data/<version> ../apps/web/public/data/mock/heidelberg 8.0 49.0 9.5 50.0 Heidelberg
```

## Mock data

`apps/web/public/data/mock/oberfranken/` comes from the spike scripts in `spike/`. To regenerate it:

```sh
cd pipeline
python extract.py oberfranken-latest.osm.pbf extract.json
python spike/export_mock.py extract.json <dem-dir> ../apps/web/public/data/mock/oberfranken
```

- `oberfranken-latest.osm.pbf` is from Geofabrik.
- `<dem-dir>` holds the Copernicus GLO-30 tiles N49–N50, E010–E012.
