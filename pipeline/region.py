"""The region the pipeline builds."""

NAME = "Baden-Württemberg, Hessen, Bayern"
STATES = ["baden-wuerttemberg", "hessen", "bayern"]
# Copernicus GLO-30 tiles (lat, lon of the south-west corner) that cover the states.
DEM_TILES = [(lat, lon) for lat in range(47, 52) for lon in range(7, 14)]
TILE_DEG = 0.5  # network tile size
