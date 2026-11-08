"""Train reach on a made-up timetable. Run from pipeline/: uv run --with pytest pytest tests"""

import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import reach  # noqa: E402

# Home, Bach, Cell, Dorf on a line, 0.1° apart.
STOPS = [("Home Hbf", "1", 49.0), ("Bach", "2", 49.1), ("Cell", "3", 49.2), ("Dorf", "4", 49.3)]
OURS = [{"id": f"n{sid}", "name": name, "lat": lat + 0.0005, "lon": 8.0} for name, sid, lat in STOPS]
HOME = "n1"


def feed_zip(path, agency, trips):
    """trips: [(trip id, [(stop id, "HH:MM"), ...])]"""
    files = {
        "agency.txt": "agency_id,agency_name\n" + f"1,{agency}\n",
        "routes.txt": "route_id,agency_id,route_short_name,route_type\nr1,1,X,2\n",
        "stops.txt": "stop_id,stop_name,parent_station,stop_lat,stop_lon\n" + "".join(f"{sid},{name},,{lat},8.0\n" for name, sid, lat in STOPS),
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nall,1,1,1,1,1,1,1,20261101,20261130\n",
        "calendar_dates.txt": "service_id,date,exception_type\n",
        "trips.txt": "route_id,service_id,trip_id\n" + "".join(f"r1,all,{tid}\n" for tid, _ in trips),
        "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\n"
        + "".join(f"{tid},{t}:00,{t}:00,{sid},{i},,\n" for tid, stops in trips for i, (sid, t) in enumerate(stops)),
    }
    with zipfile.ZipFile(path, "w") as zf:
        for name, text in files.items():
            zf.writestr(name, text)


def build(tmp_path, rv, fv, rv_agency="DB Regio AG"):
    feed_zip(tmp_path / "rv_free.zip", rv_agency, rv)
    feed_zip(tmp_path / "fv_free.zip", "DB Fernverkehr AG", fv)
    paths = {"rv_free": str(tmp_path / "rv_free.zip"), "fv_free": str(tmp_path / "fv_free.zip")}
    files = reach.build(paths, OURS, "test", log=lambda *a: None, homes=["Home Hbf"])
    return files[f"{HOME}.json"]


RV = [
    ("ra", [("1", "08:00"), ("2", "08:30")]),
    ("rb", [("2", "08:40"), ("3", "09:00")]),
    ("rc", [("3", "09:10"), ("4", "09:30")]),
    ("rd", [("3", "16:00"), ("1", "16:30")]),
]
FV = [
    ("fa", [("1", "08:10"), ("3", "08:35")]),
    ("fb", [("3", "17:00"), ("1", "17:20")]),
]


def test_out_by_changes_with_and_without_ice(tmp_path):
    out = build(tmp_path, RV, FV)["out"]["saturday"]
    # Bach: one regional train, 30 min.
    assert out["n2"] == [30, 30, 30, 30, 30, 30, 0]
    # Cell: ICE direct in 25 min. Regional only with one change, 60 min.
    assert out["n3"] == [25, 25, 25, None, 60, 60, 7]
    # Dorf: ICE and one change, 80 min. Regional only needs two changes, 90 min.
    assert out["n4"] == [None, 80, 80, None, None, 90, 6]
    assert HOME not in out


def test_back_arrives_home(tmp_path):
    back = build(tmp_path, RV, FV)["back"]["sunday"]
    # Cell to home: ICE 20 min, regional 30 min, both direct.
    assert back["n3"] == [20, 20, 20, 30, 30, 30, 7]


def test_change_needs_time(tmp_path):
    # The ICE reaches Cell 3 minutes before the train to Dorf leaves. Too short with a bike.
    fv = [("fa", [("1", "08:10"), ("3", "09:07")])]
    out = build(tmp_path, RV, fv)["out"]["weekday"]
    assert out["n4"] == [None, None, 90, None, None, 90, 0]


def test_out_window_and_longest_journey(tmp_path):
    rv = [
        ("early", [("1", "06:50"), ("2", "07:00")]),  # before 07:00, left out
        ("late", [("1", "14:50"), ("2", "15:15")]),  # leaves by 15:00, a half day
        ("after", [("1", "15:10"), ("3", "15:20")]),  # after 15:00, left out
        ("long", [("1", "08:00"), ("4", "15:01")]),  # over 7 hours, left out
    ]
    out = build(tmp_path, rv, [])["out"]["weekday"]
    assert out["n2"] == [25, 25, 25, 25, 25, 25, 0]
    assert "n3" not in out
    assert "n4" not in out


def test_long_distance_trains_in_the_regional_feed_need_a_reservation(tmp_path):
    out = build(tmp_path, RV, [], rv_agency="DB Fernverkehr AG")["out"]["weekday"]
    assert out["n2"] == [30, 30, 30, None, None, None, 7]


def test_days_and_windows(tmp_path):
    f = build(tmp_path, RV, FV)
    assert f["dates"] == {"weekday": "2026-11-03", "saturday": "2026-11-07", "sunday": "2026-11-01"}
    assert f["home"] == {"id": HOME, "name": "Home Hbf"}
    assert f["attribution"] == "gtfs.de, DELFI e.V."


def test_match_by_name_and_distance():
    theirs = {
        "a": {"name": "Karlsruhe Hbf", "lat": 49.0, "lon": 8.4},
        "b": {"name": "Karlsruhe Albtalbahnhof", "lat": 49.0005, "lon": 8.4},
        "c": {"name": "Durlach Bf", "lat": 49.1, "lon": 8.4},
    }
    ours = [
        {"id": "x", "name": "Karlsruhe Hauptbahnhof", "lat": 49.0006, "lon": 8.4},
        {"id": "y", "name": "Somewhere", "lat": 49.1001, "lon": 8.4},
        {"id": "z", "name": "Far away", "lat": 50.0, "lon": 8.4},
    ]
    assert reach.match(ours, theirs) == {"x": "a", "y": "c"}
