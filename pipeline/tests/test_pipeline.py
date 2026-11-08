"""Pipeline checks on small inputs. Run from pipeline/: uv run --with pytest pytest tests"""

import gzip
import json
import os
import shutil
import sys

import numpy as np
import tifffile

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.dirname(HERE)
ROOT = os.path.dirname(PIPELINE)
sys.path.insert(0, PIPELINE)

import build  # noqa: E402
import download  # noqa: E402
import export as X  # noqa: E402

# Packed by export.pack_tile from the mock tile. The app reads it in
# packages/providers/src/networkTile.test.ts.
FIXTURE_BIN = os.path.join(ROOT, "packages/providers/fixtures/17_98.bin")
FIXTURE_JSON = os.path.join(ROOT, "apps/web/public/data/mock/heidelberg/tiles/17_98.json")
# Signed cycle routes, towns, a station and hotels around Bamberg, cut from
# the filtered Germany extract: osmium extract -s complete_ways -b 10.84,49.86,10.97,49.94
SAMPLE = os.path.join(HERE, "fixtures/sample-latest.osm.pbf")


def test_packed_tile_matches_what_the_app_reads():
    with open(FIXTURE_JSON) as f:
        tile = json.load(f)
    with gzip.open(FIXTURE_BIN, "rb") as f:
        want = f.read()
    assert X.pack_tile(tile) == want


def test_packed_tile_reads_back():
    with gzip.open(FIXTURE_BIN, "rb") as f:
        want = f.read()
    assert X.pack_tile(X.read_tile(FIXTURE_BIN)) == want


def test_sample_build(tmp_path, monkeypatch):
    cache, out = tmp_path / "cache", tmp_path / "out"
    os.makedirs(cache / "osm")
    os.makedirs(cache / "work")
    shutil.copy(SAMPLE, cache / "osm" / "sample-latest.osm.pbf")
    write_dem(cache / "dem", lat=49, lon=10)

    # No downloads. The sample is already filtered, so osmium-tool is not
    # needed. Route lines need tippecanoe and are left out.
    monkeypatch.setattr(download, "main", lambda *args: None)
    monkeypatch.setattr(build, "osm_file", lambda cache, area: os.path.join(cache, "osm", "sample-latest.osm.pbf"))
    monkeypatch.setattr(build.L, "build", lambda *args: {"routes": 0, "files": 0, "empty": 0, "bytes": 0, "max": 0})
    monkeypatch.setattr(sys, "argv", ["build.py", "--cache", str(cache), "--out", str(out), "--area", "sample"])
    build.main()

    with open(out / "latest.json") as f:
        version = json.load(f)["version"]
    data = out / version
    with open(data / "manifest.json") as f:
        manifest = json.load(f)
    assert version.startswith("sample-")
    assert manifest["tiles"]["format"] == 1

    keys = manifest["tiles"]["keys"]
    assert keys
    nodes, edges = {}, {}
    for key in keys:
        tile = X.read_tile(str(data / "tiles" / f"{key}.bin"))
        nodes.update((n["id"], n) for n in tile["nodes"])
        edges.update((e["id"], e) for e in tile["edges"])
    assert len(nodes) > 50
    assert len(edges) > 50
    assert all(e["from"] in nodes and e["to"] in nodes for e in edges.values())
    assert any(e["routes"] for e in edges.values())
    # The synthetic DEM rises to the north, so some edges climb.
    assert any(e["ascent"] > 0 for e in edges.values())

    places = [p for key in manifest["tiles"]["places"]["keys"] for p in read_json(data / "places" / f"{key}.json")["towns"]]
    assert any(p["name"] == "Bamberg" for p in places)


def write_dem(folder, lat, lon, size=360):
    """A small DEM tile: 200 m in the south, 600 m in the north."""
    os.makedirs(folder)
    rows = np.linspace(600, 200, size, dtype=np.float32)
    a = np.repeat(rows[:, None], size, axis=1)
    name = download.dem_name(lat, lon)
    scale = (1 / size, 1 / size, 0.0)
    tifffile.imwrite(folder / f"{name}.tif", a, extratags=[(33550, "d", 3, scale, False)])


def read_json(path):
    with open(path) as f:
        return json.load(f)
