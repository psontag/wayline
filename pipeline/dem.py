"""Elevation from Copernicus GLO-30 tiles (1x1 degree GeoTIFFs)."""

import glob
import math
import os
import re
from collections import OrderedDict

import numpy as np
import tifffile

MAX_LOADED = 6  # a tile is up to 52 MB in memory


class Dem:
    def __init__(self, folder):
        self.paths = {}
        for path in glob.glob(os.path.join(folder, "*.tif")):
            m = re.search(r"_N(\d+)_00_E(\d+)_00_", path)
            self.paths[(int(m.group(1)), int(m.group(2)))] = path
        self.loaded = OrderedDict()

    def tile(self, key):
        if key in self.loaded:
            self.loaded.move_to_end(key)
            return self.loaded[key]
        path = self.paths.get(key)
        if path is None:
            return None
        page = tifffile.TiffFile(path).pages[0]
        sx, sy, _ = page.tags["ModelPixelScaleTag"].value
        self.loaded[key] = (page.asarray(), sx, sy)
        if len(self.loaded) > MAX_LOADED:
            self.loaded.popitem(last=False)
        return self.loaded[key]

    def elevations(self, lon, lat):
        """Elevation of many points (numpy arrays), 0 where there is no tile. One tile at a time."""
        out = np.zeros(len(lon), dtype=np.float32)
        key = np.floor(lat).astype(np.int64) * 1000 + np.floor(lon).astype(np.int64)
        order = np.argsort(key, kind="stable")
        keys, starts = np.unique(key[order], return_index=True)
        for k, rows in zip(keys.tolist(), np.split(order, starts[1:])):
            tile = self.tile((k // 1000, k % 1000))
            if tile is None:
                continue
            a, sx, sy = tile
            lat0, lon0 = k // 1000, k % 1000
            r = np.minimum(((lat0 + 1 - lat[rows]) / sy).astype(np.int64), a.shape[0] - 1)
            c = np.minimum(((lon[rows] - lon0) / sx).astype(np.int64), a.shape[1] - 1)
            out[rows] = a[r, c]
        return out

    def elevation(self, lon, lat):
        tile = self.tile((math.floor(lat), math.floor(lon)))
        if tile is None:
            return None
        a, sx, sy = tile
        row = min(int((math.floor(lat) + 1 - lat) / sy), a.shape[0] - 1)
        col = min(int((lon - math.floor(lon)) / sx), a.shape[1] - 1)
        return float(a[row, col])
