"""The region the pipeline builds."""

NAME = "Deutschland"
ID = "de"  # start of the data version
STATES = [
    "baden-wuerttemberg",
    "bayern",
    "berlin",
    "brandenburg",
    "bremen",
    "hamburg",
    "hessen",
    "mecklenburg-vorpommern",
    "niedersachsen",
    "nordrhein-westfalen",
    "rheinland-pfalz",
    "saarland",
    "sachsen",
    "sachsen-anhalt",
    "schleswig-holstein",
    "thueringen",
]
# Copernicus GLO-30 tiles (lat, lon of the south-west corner) that cover the states.
DEM_TILES = [(lat, lon) for lat in range(47, 56) for lon in range(5, 16)]
# Scenery grid. Points outside count as no scenery.
BBOX = (5.8, 47.2, 15.1, 55.1)
TILE_DEG = 0.5  # network tile size
