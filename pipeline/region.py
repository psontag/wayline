"""The region the pipeline builds."""

NAME = "Deutschland und Schweiz"
ID = "eu"  # start of the data version, and the --area of the full build
# Geofabrik extracts under europe/, merged. One of them, or a German state
# such as "hessen", also works as --area for quick builds.
EXTRACTS = ["germany", "switzerland"]
# Copernicus GLO-30 tiles (lat, lon of the south-west corner).
DEM_TILES = sorted(
    {(lat, lon) for lat in range(47, 56) for lon in range(5, 16)}  # Germany
    | {(lat, lon) for lat in range(45, 48) for lon in range(5, 11)}  # Switzerland
)
# Scenery grid. Points outside count as no scenery.
BBOX = (5.8, 45.7, 15.1, 55.1)
TILE_DEG = 0.5  # network tile size


def extracts(area):
    """Geofabrik paths of the area's extracts, under europe/."""
    if area == ID:
        return EXTRACTS
    if area in EXTRACTS:
        return [area]
    return [f"germany/{area}"]
