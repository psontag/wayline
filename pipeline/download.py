"""Download the pipeline inputs into the cache folder. Skips files that exist.

Usage: python download.py [cache_dir]
"""

import os
import sys
import urllib.error
import urllib.request

from region import DEM_TILES, STATES

GEOFABRIK = "https://download.geofabrik.de/europe/germany/{}-latest.osm.pbf"
DEM = "https://copernicus-dem-30m.s3.amazonaws.com/{0}/{0}.tif"


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
        print(f"  {e.code}, skipped")
        return
    os.replace(tmp, path)


def main(cache):
    os.makedirs(os.path.join(cache, "osm"), exist_ok=True)
    os.makedirs(os.path.join(cache, "dem"), exist_ok=True)
    for state in STATES:
        fetch(GEOFABRIK.format(state), os.path.join(cache, "osm", f"{state}-latest.osm.pbf"))
    for lat, lon in DEM_TILES:
        name = dem_name(lat, lon)
        fetch(DEM.format(name), os.path.join(cache, "dem", f"{name}.tif"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache"))
