"""Elevation from Copernicus GLO-30 tiles (1x1 degree GeoTIFFs)."""

import glob
import math
import os
import re

import tifffile


class Dem:
    def __init__(self, folder):
        self.tiles = {}
        for path in glob.glob(os.path.join(folder, "*.tif")):
            m = re.search(r"_N(\d+)_00_E(\d+)_00_", path)
            page = tifffile.TiffFile(path).pages[0]
            sx, sy, _ = page.tags["ModelPixelScaleTag"].value
            self.tiles[(int(m.group(1)), int(m.group(2)))] = (page.asarray(), sx, sy)

    def elevation(self, lon, lat):
        tile = self.tiles.get((math.floor(lat), math.floor(lon)))
        if tile is None:
            return None
        a, sx, sy = tile
        row = min(int((math.floor(lat) + 1 - lat) / sy), a.shape[0] - 1)
        col = min(int((lon - math.floor(lon)) / sx), a.shape[1] - 1)
        return float(a[row, col])
