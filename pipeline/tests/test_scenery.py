"""Which OSM tags count for which scenery layer. Run from pipeline/: uv run --with pytest pytest tests"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import scenery as S  # noqa: E402


def test_built_up_land_is_urban():
    for landuse in ("residential", "commercial", "industrial", "retail"):
        assert S.area_layers({"landuse": landuse}) == ["urban"]
    assert "urban" not in S.area_layers({"landuse": "farmland"})


def test_biosphere_reserves_are_nature():
    # The Pfälzerwald is mapped only like this, without protect_class.
    assert S.is_nature({"boundary": "protected_area", "designation": "unesco_biosphere_reserve"})
    assert S.is_nature({"boundary": "protected_area", "protection_title": "Biosphärenreservat"})


def test_landscape_protection_is_not_nature():
    assert not S.is_nature({"boundary": "protected_area", "protect_class": "5", "protection_title": "Landschaftsschutzgebiet"})
