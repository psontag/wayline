"""Areas from a made-up shapefile. Run from pipeline/: uv run --with pytest pytest tests"""

import os
import struct
import sys
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import areas as A  # noqa: E402
import lines as L  # noqa: E402

# Two areas side by side in UTM 32N, 10 km each, around 49.0° N, 9.0° E.
# West: 490-500 km east, east: 500-510 km east. North 5420-5430 km.
# The shared border has a 50 m wiggle that simplification takes out.
X0, X1, X2 = 490_000.0, 500_000.0, 510_000.0
Y0, Y1 = 5_420_000.0, 5_430_000.0
BORDER = [(X1, Y0), (X1 + 50, Y0 + 2500), (X1, Y0 + 5000), (X1 - 50, Y0 + 7500), (X1, Y1)]


def ring(pts):
    """Closed ring, clockwise as in a shapefile."""
    return list(pts) + [pts[0]]


WEST = ring([(X0, Y0), (X0, Y1), *reversed(BORDER)])
EAST = ring([*BORDER, (X2, Y1), (X2, Y0)])


def shp(shapes):
    recs = b""
    for i, rings in enumerate(shapes, 1):
        pts = [p for r in rings for p in r]
        starts, n = [], 0
        for r in rings:
            starts.append(n)
            n += len(r)
        body = struct.pack("<i4d2i", 5, 0, 0, 0, 0, len(rings), len(pts))
        body += struct.pack(f"<{len(rings)}i", *starts) + b"".join(struct.pack("<2d", *p) for p in pts)
        recs += struct.pack(">2i", i, len(body) // 2) + body
    header = struct.pack(">7i", 9994, 0, 0, 0, 0, 0, (100 + len(recs)) // 2) + struct.pack("<2i8d", 1000, 5, *[0] * 8)
    return header + recs


def dbf(records):
    fields = [("SN_RG", 3), ("RG", 100)]
    size = 1 + sum(n for _, n in fields)
    header_len = 32 + 32 * len(fields) + 1
    out = struct.pack("<B3BIHH20x", 3, 25, 1, 1, len(records), header_len, size)
    for name, n in fields:
        out += name.encode().ljust(11, b"\0") + b"C" + b"\0" * 4 + bytes([n]) + b"\0" * 15
    out += b"\x0d"
    for rec in records:
        out += b" " + b"".join(rec[name].encode().ljust(n) for name, n in fields)
    return out + b"\x1a"


def layer(tmp_path):
    path = tmp_path / "ge250.zip"
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(A.LAYER + ".shp", shp([[WEST], [EAST]]))
        zf.writestr(A.LAYER + ".dbf", dbf([{"SN_RG": "T11", "RG": "Romantisches Franken - lang"}, {"SN_RG": "Z01", "RG": "Ostgäu"}]))
    return A.read_layer(path)


def lonlat(x, y):
    return [float(v) for v in A.utm_to_lonlat(np.array([[x, y]]))[0]]


def test_utm_on_the_central_meridian():
    # Meridian arc of GRS80 at 50° N: 5,540,847.04 m.
    lon, lat = lonlat(500_000, 0.9996 * 5_540_847.04)
    assert abs(lon - 9.0) < 1e-9
    assert abs(lat - 50.0) < 1e-6


def test_reads_the_layer(tmp_path):
    recs = layer(tmp_path)
    assert [r["SN_RG"] for r, _ in recs] == ["T11", "Z01"]
    assert recs[1][0]["RG"] == "Ostgäu"
    assert len(recs[0][1]) == 1 and len(recs[0][1][0]) == len(WEST) - 1


def test_shared_border_stays_shared(tmp_path):
    areas = A.build(layer(tmp_path), [], [])
    west, east = ([tuple(p) for p in L.decode(a["outline"][0][0])] for a in areas)
    shared = set(west) & set(east)
    # Simplified to the two ends of the border, which both areas keep.
    assert len(shared) == 2
    assert len(west) == len(east) == 4


def test_names_label_and_bbox(tmp_path):
    west, east = A.build(layer(tmp_path), [], [])
    assert west["name"] == "Romantisches Franken"
    assert west["officialName"] == "Romantisches Franken - lang"
    assert east["name"] == "Ostgäu"
    w, s, e, n = west["bbox"]
    assert w < west["label"][0] < e and s < west["label"][1] < n
    assert e <= 9.0001


def test_stations_inside_and_just_outside(tmp_path):
    stations = [
        {"id": "w", **dict(zip(("lon", "lat"), lonlat(495_000, 5_425_000)))},
        {"id": "e", **dict(zip(("lon", "lat"), lonlat(505_000, 5_425_000)))},
        {"id": "near", **dict(zip(("lon", "lat"), lonlat(511_000, 5_425_000)))},  # 1 km east of the east area
        {"id": "far", **dict(zip(("lon", "lat"), lonlat(515_000, 5_425_000)))},
    ]
    west, east = A.build(layer(tmp_path), stations, [])
    assert west["stations"] == ["w"]
    assert east["stations"] == ["e", "near"]


def test_routes_by_km_in_the_area(tmp_path):
    across = [lonlat(492_000, 5_425_000), lonlat(508_000, 5_425_000)]  # 8 km in each
    short = [lonlat(505_000, 5_421_000), lonlat(505_000, 5_426_000)]  # 5 km, in the east only
    long = [lonlat(491_000, 5_429_000), lonlat(491_000, 5_421_000), lonlat(499_000, 5_421_000)]  # 16 km in the west
    west, east = A.build(layer(tmp_path), [], [("Quer-Radweg", across), ("Kurz", short), ("Lang", long)])
    assert [n for n, _ in west["routes"]] == ["Lang"]
    assert 15 <= west["routes"][0][1] <= 17
    assert east["routes"] == []
