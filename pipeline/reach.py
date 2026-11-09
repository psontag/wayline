"""Train reach from home stations, from the gtfs.de timetables.

Usage: python reach.py <data_dir> [--cache DIR]  (adds the reach files to a built dataset)

For each home station, day type and direction, the shortest train time to or
from every station, for at most 0, 1 and 2 changes. Once with all trains, once
with regional trains only. Long-distance trains (IC, ICE, EC, ...) need a bike
reservation.

"Out" leaves home 07:00-15:00. "Back" arrives home 15:00-22:00. Times are for
one typical date per day type, so they say how far a station is, not which
train to take.

Uses range RAPTOR (Delling et al., "Round-Based Public Transit Routing").
"""

import argparse
import bisect
import csv
import datetime
import difflib
import io
import json
import math
import os
import re
import sys
import time
import zipfile
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
# gtfs.de feeds, CC BY 4.0, data from DELFI e.V. True: every train needs a bike reservation.
FEEDS = {"rv_free": False, "fv_free": True}
# rv_free also has long-distance trains, with line numbers as names. Their
# operators. SBB GmbH (regional in Germany) is not SBB.
LONG_DISTANCE = {"DB Fernverkehr AG", "DB Fernverkehr (Codesharing)", "Flixtrain", "European Sleeper", "EUROSTAR", "WESTbahn", "SNCF", "ÖBB", "SBB"}
ATTRIBUTION = "gtfs.de, DELFI e.V."
HOMES = ["Karlsruhe Hbf"]
# Weekdays: Tuesday to Thursday, since Mondays and Fridays have extra trains.
DAY_TYPES = {"weekday": (1, 2, 3), "saturday": (5,), "sunday": (6,)}
# Departures from home, minutes after midnight. Until 15:00 for a half day on the bike.
OUT_WINDOW = (7 * 60, 15 * 60)
HOME_WINDOW = (15 * 60, 22 * 60)  # arrivals at home
MAX_MINUTES = 12 * 60  # longer journeys are left out. Covers all of Germany.
MAX_CHANGES = 2
CHANGE_MINUTES = 5  # to change trains with a bike
MATCH_M = 300  # our station to a timetable station, by distance alone
MATCH_NAME_M = 1500  # the same, with the same name
INF = 1 << 30


# --- Reading the feeds ---


def rows(zf, name):
    with zf.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))


def minutes(hms):
    h, m, _ = hms.split(":")
    return int(h) * 60 + int(m)


def ymd(s):
    return datetime.date(int(s[:4]), int(s[4:6]), int(s[6:]))


class Feed:
    """Stations, services and trips of all feeds. Stop ids are shared between the gtfs.de feeds."""

    def __init__(self, paths):
        self.station_of = {}  # stop id -> station id (the parent station, or the stop)
        self.stations = {}  # station id -> {name, lat, lon}
        self.services = {}  # service key -> (weekdays, start, end)
        self.exceptions = defaultdict(dict)  # service key -> {date: added}
        self.trips = {}  # trip key -> (service key, reservation)
        self.zips = paths
        for feed, path in paths.items():
            with zipfile.ZipFile(path) as zf:
                self._read(feed, zf)

    def _read(self, feed, zf):
        for r in rows(zf, "stops.txt"):
            sid = r["parent_station"] or r["stop_id"]
            self.station_of[r["stop_id"]] = sid
            if r["stop_id"] == sid or sid not in self.stations:
                self.stations[sid] = {"name": r["stop_name"], "lat": float(r["stop_lat"]), "lon": float(r["stop_lon"])}
        for r in rows(zf, "calendar.txt"):
            days = tuple(r[d] == "1" for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))
            self.services[(feed, r["service_id"])] = (days, ymd(r["start_date"]), ymd(r["end_date"]))
        for r in rows(zf, "calendar_dates.txt"):
            self.exceptions[(feed, r["service_id"])][ymd(r["date"])] = r["exception_type"] == "1"
        agency = {r["agency_id"]: r["agency_name"] for r in rows(zf, "agency.txt")}
        far = {r["route_id"] for r in rows(zf, "routes.txt") if FEEDS[feed] or agency.get(r["agency_id"]) in LONG_DISTANCE}
        for r in rows(zf, "trips.txt"):
            self.trips[(feed, r["trip_id"])] = ((feed, r["service_id"]), r["route_id"] in far)

    def runs(self, service, date):
        ex = self.exceptions.get(service, {})
        if date in ex:
            return ex[date]
        cal = self.services.get(service)
        return cal is not None and cal[1] <= date <= cal[2] and cal[0][date.weekday()]

    def typical_dates(self):
        """Per day type the date with the most trips, so holidays are not picked."""
        per_service = defaultdict(int)
        for service, _ in self.trips.values():
            per_service[service] += 1
        first = min(c[1] for c in self.services.values())
        last = max(c[2] for c in self.services.values())
        counts = {}
        d = first
        while d <= last:
            counts[d] = sum(n for s, n in per_service.items() if self.runs(s, d))
            d += datetime.timedelta(days=1)
        return {name: max((d for d in counts if d.weekday() in days), key=lambda d: (counts[d], -d.toordinal())) for name, days in DAY_TYPES.items()}

    def stop_times(self, dates):
        """Trips that run on any of the dates: trip key -> [(station, arr, dep, pickup, drop-off)]."""
        keep = {k for k, (s, _) in self.trips.items() if any(self.runs(s, d) for d in dates)}
        out = defaultdict(list)
        for feed, path in self.zips.items():
            with zipfile.ZipFile(path) as zf:
                for r in rows(zf, "stop_times.txt"):
                    key = (feed, r["trip_id"])
                    if key in keep:
                        out[key].append((int(r["stop_sequence"]), self.station_of[r["stop_id"]], minutes(r["arrival_time"]), minutes(r["departure_time"]), r["pickup_type"] != "1", r["drop_off_type"] != "1"))
        for stops in out.values():
            stops.sort()
        return out


# --- Timetable for one date ---


class Route:
    """Trips with the same stations in the same order. No trip overtakes another."""

    def __init__(self, stations):
        self.stations = stations
        self.trips = []  # (arr, dep, pickup, drop-off, reservation), each a tuple per stop
        self.deps = None  # per stop: departure times of the trips, ascending

    def fits(self, trip):
        last = self.trips[-1]
        return all(a >= b for a, b in zip(trip[1], last[1])) and all(a >= b for a, b in zip(trip[0], last[0]))


def timetable(trips, reverse=False):
    """Routes for RAPTOR. trips: [(stops, reservation)] with stops as (station, arr, dep, pickup, drop-off).

    reverse=True turns time around (t -> -t) and runs every trip backwards, so a
    forward search from home finds the trains that go home.
    """
    groups = defaultdict(list)
    for stops, resv in trips:
        if reverse:
            stops = [(s, -d, -a, dr, pu) for s, a, d, pu, dr in reversed(stops)]
        if len(stops) < 2:
            continue
        stations = tuple(s[0] for s in stops)
        trip = tuple(tuple(s[i] for s in stops) for i in (1, 2, 3, 4)) + (resv,)
        groups[stations].append(trip)
    routes = []
    for stations, ts in groups.items():
        mine = []
        for trip in sorted(ts, key=lambda t: t[1][0]):
            for r in mine:
                if r.fits(trip):
                    r.trips.append(trip)
                    break
            else:
                r = Route(stations)
                r.trips.append(trip)
                mine.append(r)
        routes += mine
    for r in routes:
        r.deps = [[t[1][i] for t in r.trips] for i in range(len(r.stations))]
    at = defaultdict(list)
    for ri, r in enumerate(routes):
        for i, s in enumerate(r.stations):
            at[s].append((ri, i))
    return routes, at


def raptor(routes, at, home, starts, max_trips=MAX_CHANGES + 1, max_minutes=MAX_MINUTES):
    """Range RAPTOR from home over the start times.

    Returns best[k][station] = (minutes, reservation) for journeys with exactly
    k trains, as far as they beat fewer trains. Starts are departure times from home.
    """
    # tau[k][s] = (time, reservation, by train). tau[k] is never later than tau[k-1].
    tau = [dict() for _ in range(max_trips + 1)]
    best = [dict() for _ in range(max_trips + 1)]
    # No waiting at home for a train after the window.
    last = max(starts, default=-INF)
    for d in sorted(set(starts), reverse=True):
        tau[0][home] = (d, False, False)
        marked = {home}
        for k in range(1, max_trips + 1):
            prev, cur = tau[k - 1], tau[k]
            queue = {}
            for p in marked:
                lp = prev[p]
                if lp[0] < cur.get(p, (INF,))[0]:
                    cur[p] = lp
                for ri, i in at.get(p, ()):
                    if i < queue.get(ri, INF):
                        queue[ri] = i
            marked = set()
            for ri, i0 in queue.items():
                r = routes[ri]
                trip, ti, board_resv = None, INF, False
                for i in range(i0, len(r.stations)):
                    s = r.stations[i]
                    if trip is not None and trip[3][i]:
                        t = trip[0][i]
                        if t - d <= max_minutes and t < cur.get(s, (INF,))[0]:
                            resv = board_resv or trip[4]
                            cur[s] = (t, resv, True)
                            marked.add(s)
                            b = best[k].get(s)
                            if b is None or t - d < b[0]:
                                best[k][s] = (t - d, resv)
                    lp = prev.get(s)
                    if lp is None:
                        continue
                    ready = lp[0] + (CHANGE_MINUTES if lp[2] else 0)
                    if trip is not None and ready > trip[1][i]:
                        continue
                    j = bisect.bisect_left(r.deps[i], ready)
                    while j < len(r.trips) and not r.trips[j][2][i]:
                        j += 1
                    if s == home and j < len(r.trips) and r.deps[i][j] > last:
                        continue
                    if j < len(r.trips) and j < ti:
                        trip, ti, board_resv = r.trips[j], j, lp[1]
            if not marked:
                break
    return best


def summarize(best):
    """Per station: [min with <= 0, 1, 2 changes] and a reservation bit per change count."""
    out = {}
    stations = set().union(*best[1:])
    for s in stations:
        mins, flags, m, f = [], 0, None, False
        for k in range(1, len(best)):
            b = best[k].get(s)
            if b is not None and (m is None or b[0] < m):
                m, f = b
            mins.append(m)
            if m is not None and f:
                flags |= 1 << (k - 1)
        out[s] = (mins, flags)
    return out


def search(trips_by_key, feed, date, home):
    """Out and back for one date: station -> [m0, m1, m2, regional m0, m1, m2, flags]."""
    trips = [(stops, feed.trips[key][1]) for key, stops in trips_by_key.items() if feed.runs(feed.trips[key][0], date)]
    clean = [([(s, a, d, pu, dr) for _, s, a, d, pu, dr in stops], resv) for stops, resv in trips]
    out = {}
    for direction in ("out", "back"):
        reverse = direction == "back"
        result = {}
        for regional in (False, True):
            routes, at = timetable([t for t in clean if not (regional and t[1])], reverse)
            starts = home_times(routes, home, reverse)
            result[regional] = summarize(raptor(routes, at, home, starts))
        rows = {}
        for s, (mins, flags) in result[False].items():
            if s == home:
                continue
            reg = result[True].get(s, ([None] * len(mins), 0))[0]
            rows[s] = mins + reg + [flags]
        out[direction] = rows
    return out


def home_times(routes, home, reverse):
    """Departures from home in the out window, or arrivals at home in the home window (turned around)."""
    lo, hi = HOME_WINDOW if reverse else OUT_WINDOW
    times = set()
    for r in routes:
        for i, s in enumerate(r.stations):
            if s == home:
                for t in r.deps[i]:
                    real = -t if reverse else t
                    if lo <= real <= hi:
                        times.add(t)
    return times


# --- Matching our stations ---


def norm(name):
    n = name.lower().replace("hauptbahnhof", "hbf").replace("bahnhof", "").replace("(", " ").replace(")", " ")
    return re.sub(r"[^a-z0-9äöüß]+", " ", n).strip()


def dist_m(a, b):
    k = math.cos(math.radians(a["lat"]))
    return math.hypot((a["lon"] - b["lon"]) * k, a["lat"] - b["lat"]) * 111_320


def match(ours, theirs):
    """Our station id -> timetable station id. Same name nearby wins, else the nearest close one."""
    cell = 0.02
    grid = defaultdict(list)
    for sid, s in theirs.items():
        grid[(int(s["lon"] // cell), int(s["lat"] // cell))].append(sid)
    out = {}
    for o in ours:
        cx, cy = int(o["lon"] // cell), int(o["lat"] // cell)
        near = [(dist_m(o, theirs[sid]), sid) for dx in (-1, 0, 1) for dy in (-1, 0, 1) for sid in grid.get((cx + dx, cy + dy), ())]
        name = norm(o["name"])
        named = [(d, sid) for d, sid in near if d <= MATCH_NAME_M and difflib.SequenceMatcher(None, name, norm(theirs[sid]["name"])).ratio() >= 0.85]
        pick = min(named) if named else min(((d, sid) for d, sid in near if d <= MATCH_M), default=None)
        if pick:
            out[o["id"]] = pick[1]
    return out


# --- Output ---


def build(gtfs, stations, version, log=print, homes=HOMES):
    """Reach files for every home station found in our stations: {file name: content}."""
    t0 = time.time()
    feed = Feed(gtfs)
    served = {}
    dates = feed.typical_dates()
    trips = feed.stop_times(list(dates.values()))
    for stops in trips.values():
        for _, s, *_ in stops:
            served[s] = feed.stations[s]
    ids = match(stations, served)
    log(f"reach: {len(served)} timetable stations, {len(ids)} of {len(stations)} of ours matched, dates {dates}")
    by_theirs = defaultdict(list)
    for ours, theirs in ids.items():
        by_theirs[theirs].append(ours)
    files = {}
    for home_name in homes:
        home = next((s for s in stations if norm(s["name"]) == norm(home_name) and s["id"] in ids), None)
        if home is None:
            log(f"reach: home {home_name} not in this area, skipped")
            continue
        content = {
            "version": version,
            "home": {"id": home["id"], "name": home["name"]},
            "attribution": ATTRIBUTION,
            "dates": {k: d.isoformat() for k, d in dates.items()},
            "windows": {"out": list(OUT_WINDOW), "back": list(HOME_WINDOW)},
            "format": "station id -> [minutes with <= 0, 1, 2 changes, the same by regional trains only, reservation bits]",
            "out": {},
            "back": {},
        }
        for day, date in dates.items():
            res = search(trips, feed, date, ids[home["id"]])
            for direction, rows in res.items():
                content[direction][day] = {o: row for theirs, row in rows.items() for o in by_theirs.get(theirs, ())}
        files[f"{home['id']}.json"] = content
        log(f"reach: {home_name}: {len(content['out']['weekday'])} stations out on weekdays, {time.time() - t0:.0f} s")
    return files


def gtfs_paths(cache):
    paths = {f: os.path.join(cache, "gtfs", f"{f}.zip") for f in FEEDS}
    return paths if all(os.path.exists(p) for p in paths.values()) else None


def write_into(data_dir, files):
    """Writes reach/<home>.json and returns the manifest entry."""
    entry = []
    for name, content in files.items():
        path = os.path.join(data_dir, "reach", name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(content, f, ensure_ascii=False, separators=(",", ":"))
        entry.append({"station": content["home"]["id"], "name": content["home"]["name"], "path": f"reach/{name}"})
    return entry


def main():
    import download
    import export as X

    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--cache", default=os.path.join(HERE, "cache"))
    args = ap.parse_args()
    download.gtfs(args.cache)
    places = X.read_places(args.data_dir)
    files = build(gtfs_paths(args.cache), places["stations"], places["version"])
    entry = write_into(args.data_dir, files)
    path = os.path.join(args.data_dir, "manifest.json")
    with open(path) as f:
        manifest = json.load(f)
    manifest["files"]["reach"] = entry
    with open(path, "w") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    main()
