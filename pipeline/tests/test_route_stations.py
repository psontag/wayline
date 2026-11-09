"""Stations along signed routes on a made-up network. Run from pipeline/: uv run --with pytest pytest tests"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import export as X  # noqa: E402
import route_stations as R  # noqa: E402

NAMES = os.path.join(HERE, "..", "..", "packages", "planner", "src", "generate", "routeNames.json")
# 0.1° of latitude is about 11.1 km.
DEG_KM = 11.1


def test_clean_names_match_the_app():
    with open(NAMES) as f:
        cases = json.load(f)
    for name, clean in cases["clean"]:
        assert R.clean_name(name) == clean, name
    for name in cases["drop"]:
        assert R.clean_name(name) is None, name


def edge(i, a, b, pa, pb, routes, ascent=0):
    km = R.dist_km(pa, pb)
    return {
        "id": i, "from": a, "to": b, "lengthKm": km, "network": "rcn", "routes": routes,
        "ascent": ascent, "descent": 0, "geometry": X.encode([pa, pb]), "elevation": [100, 100],
        "scenery": {"forest": 0.5, "water": 1.0, "vineyard": 0.0, "nature": 0.0, "sights": 1},
    }  # fmt: skip


def river(name, lats, lon=8.0, first_id=0, first_node=0):
    """A route running north along lon, one edge between neighbouring lats."""
    return [edge(first_id + i, first_node + i, first_node + i + 1, [lon, a], [lon, b], [name]) for i, (a, b) in enumerate(zip(lats, lats[1:]))]


TABLE = [{"name": "Fluss-Radweg Teil 1", "network": "rcn"}, {"name": "Fluss-Radweg Teil 2", "network": "rcn"}, {"name": "Ortsrunde", "network": "lcn"}]


def test_sections_count_as_one_route_with_stations_in_order():
    # Two sections, 0.0 to 0.4 and 0.4 to 0.8: about 89 km.
    edges = river("Fluss-Radweg Teil 1", [49.0, 49.2, 49.4]) + river("Fluss-Radweg Teil 2", [49.4, 49.6, 49.8], first_id=10, first_node=2)
    stations = [
        {"id": "n2", "lon": 8.01, "lat": 49.4},  # 0.7 km off, 44 km along
        {"id": "n1", "lon": 8.0, "lat": 49.0},
        {"id": "n9", "lon": 8.05, "lat": 49.2},  # 3.6 km off
    ]
    [route] = R.build(edges, stations, TABLE)
    assert route["name"] == "Fluss-Radweg"
    [part] = route["parts"]
    assert round(part["lengthKm"]) == 89
    assert [s[0] for s in part["stations"]] == ["n1", "n2"]
    assert part["stations"][0][1] == 0
    assert abs(part["stations"][1][1] - 4 * DEG_KM) < 0.5
    assert part["scenery"]["water"] == 1.0
    assert part["scenery"]["sights"] == 1.0


def test_short_and_local_routes_are_left_out():
    edges = river("Fluss-Radweg Teil 1", [49.0, 49.2]) + river("Ortsrunde", [50.0, 50.3, 50.6], first_id=10, first_node=10)
    assert R.build(edges, [], TABLE) == []


def test_both_banks_follow_one():
    # West bank 49.0 to 49.6, east bank parallel 1 km off, bridges at both ends.
    west = river("Fluss-Radweg Teil 1", [49.0, 49.3, 49.6], lon=8.0)
    east = river("Fluss-Radweg Teil 1", [49.0, 49.3, 49.6], lon=8.014, first_id=10, first_node=10)
    bridges = [edge(20, 0, 10, [8.0, 49.0], [8.014, 49.0], ["Fluss-Radweg Teil 1"]), edge(21, 2, 12, [8.0, 49.6], [8.014, 49.6], ["Fluss-Radweg Teil 1"])]
    [route] = R.build(west + east + bridges, [], TABLE)
    [part] = route["parts"]
    assert 6 * DEG_KM <= part["lengthKm"] <= 6 * DEG_KM + 2


def test_far_apart_pieces_are_parts():
    near = river("Fluss-Radweg Teil 1", [49.0, 49.3, 49.6])
    far = river("Fluss-Radweg Teil 2", [50.0, 50.3, 50.6], first_id=10, first_node=10)
    [route] = R.build(near + far, [], TABLE)
    assert len(route["parts"]) == 2


def test_climb_skips_small_rises():
    # Noise of 8 m, then a real climb of 50 m and back down.
    ele = [100, 108, 100, 108, 100, 150, 140, 100]
    assert R.climb(ele) == 50
    assert R.climb(ele[::-1]) == 50


def test_close_pieces_join_with_the_gap():
    a = river("Fluss-Radweg Teil 1", [49.0, 49.3])
    b = river("Fluss-Radweg Teil 2", [49.33, 49.6], first_id=10, first_node=10)
    [route] = R.build(a + b, [{"id": "n1", "lon": 8.0, "lat": 49.6}], TABLE)
    [part] = route["parts"]
    assert abs(part["lengthKm"] - 6 * DEG_KM) < 0.5
    assert abs(part["stations"][0][1] - 6 * DEG_KM) < 0.5
