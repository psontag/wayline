"""The region the pipeline builds."""

NAME = "Deutschland"
ID = "de"  # start of the data version
# Geofabrik extract. A state, e.g. "hessen", also works for quick builds.
AREA = "germany"
# Copernicus GLO-30 tiles (lat, lon of the south-west corner) that cover Germany.
DEM_TILES = [(lat, lon) for lat in range(47, 56) for lon in range(5, 16)]
# Scenery grid. Points outside count as no scenery.
BBOX = (5.8, 47.2, 15.1, 55.1)
TILE_DEG = 0.5  # network tile size
