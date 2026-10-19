# Pipeline

OSM data pipeline, run as a GitHub Action. Not built yet.

## Mock data

The app's mock data in `apps/web/public/data/mock/oberfranken/` comes from the spike scripts. To regenerate it:

```sh
cd pipeline/spike
python extract.py oberfranken-latest.osm.pbf extract.json
python export_mock.py extract.json <dem-dir> ../../apps/web/public/data/mock/oberfranken
```

- `oberfranken-latest.osm.pbf` is from Geofabrik.
- `<dem-dir>` holds the Copernicus GLO-30 tiles N49–N50, E010–E012 from `copernicus-dem-30m.s3.amazonaws.com`.
- Install the Python packages from `requirements.txt` first.
