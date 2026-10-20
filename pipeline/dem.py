"""Elevation from Copernicus GLO-30 tiles (1x1 degree GeoTIFFs)."""

import glob
import math
import os
import re
from collections import OrderedDict

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

    def elevation(self, lon, lat):
        tile = self.tile((math.floor(lat), math.floor(lon)))
        if tile is None:
            return None
        a, sx, sy = tile
        row = min(int((math.floor(lat) + 1 - lat) / sy), a.shape[0] - 1)
        col = min(int((lon - math.floor(lon)) / sx), a.shape[1] - 1)
        return float(a[row, col])
