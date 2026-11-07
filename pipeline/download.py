"""Download the pipeline inputs into the cache folder. Skips files that exist.

Usage: python download.py [cache_dir]
"""

import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from region import AREA, DEM_TILES

GEOFABRIK = "https://download.geofabrik.de/europe/{}-latest.osm.pbf"
DEM = "https://copernicus-dem-30m.s3.amazonaws.com/{0}/{0}.tif"
PARALLEL = 8


def dem_name(lat, lon):
    return f"Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM"


def fetch(url, path):
    if os.path.exists(path):
        return
    print(f"get {url}", flush=True)
    tmp = path + ".part"
    try:
        urllib.request.urlretrieve(url, tmp)
    except urllib.error.HTTPError as e:
        # Tiles over sea or outside the DEM do not exist.
        print(f"{e.code}, skipped {url}", flush=True)
        return
    os.replace(tmp, path)


def main(cache, area=AREA):
    os.makedirs(os.path.join(cache, "osm"), exist_ok=True)
    os.makedirs(os.path.join(cache, "dem"), exist_ok=True)
    path = area if area == AREA else f"germany/{area}"
    jobs = [(GEOFABRIK.format(path), os.path.join(cache, "osm", f"{area}-latest.osm.pbf"))]
    for lat, lon in DEM_TILES:
        name = dem_name(lat, lon)
        jobs.append((DEM.format(name), os.path.join(cache, "dem", f"{name}.tif")))
    # One DEM tile alone gets only a fraction of the bandwidth.
    with ThreadPoolExecutor(PARALLEL) as pool:
        for f in [pool.submit(fetch, url, p) for url, p in jobs]:
            f.result()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache"))
