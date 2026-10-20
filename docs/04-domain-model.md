# Domain model

## Entities

```
Trip
 ├─ settings
 └─ Stage[]
     ├─ start: Place
     ├─ end: Stop
     ├─ via: Place[]
     ├─ hotel: Hotel?
     └─ Leg[]
```

### Trip

| Field | Description |
|---|---|
| `id`, `name`, `owner` | |
| `schemaVersion` | Version of the stored trip format |
| `updatedAt` | Used for the conflict check on save (HTTP 409, `CONFLICT`) |
| `kind` | `one-way`, `multi-day-loop`, `route`, `day-loop` |
| `startDate` | Optional. Without it, no dates or weather. |
| `settings` | See below |
| `stages` | Ordered list. A single route is a trip with one stage. |
| `sharedWith` | Emails of friends who can view |

### Settings

| Field | Description |
|---|---|
| `profile` | Routing profile, e.g. `touring`, `fast`, `scenic`, `quiet` |
| `kmPerDay` | Target distance per stage |
| `maxAscentPerDay` | Meters |
| `hotelBudget` | Price range |
| `startTime` | Daily start time. Default 09:00. |
| `avgSpeed` | Default 18 km/h. Used for weather timing. |

The hotel rating filter (none, 7+, 8+, 9+) is a user preference, not a trip setting. It sits next to the Booking.com link.

### Stage

| Field | Description |
|---|---|
| `start` | Place. The end of the previous stage, or the trip start. |
| `end` | Stop |
| `via` | User-set via points |
| `hotel` | Selected hotel at the end. Empty on the last stage. |
| `legs` | Stored, see below |
| `stats` | Distance, ascent, descent, surface mix |

### Place

A snapshot: coordinates, name and type (`station`, `town`, `junction`, `hotel`, `custom`). The OSM id is stored only as a hint.

### Stop

A place at a stage end, plus a `locked` flag.

- Picking a stop or a hotel locks it.
- Automatic re-cutting never moves locked stops.

### Leg

Route between two consecutive points of a stage.

| Field | Description |
|---|---|
| `from`, `to` | Coordinates |
| `geometry` | Encoded line with elevation |
| `distance`, `ascent`, `descent` | |
| `surface` | Share per surface type |
| `provider`, `profileHash` | Used for the cache key |

### Hotel

A snapshot: OSM id, name, coordinates, stars and website if known.

## Stored vs derived

A saved trip stores:

- trip fields and settings
- per stage: start, stop, via points, hotel snapshot
- legs: encoded geometry with elevation, stats, provider, profileHash

Opening a trip never calls the router. Legs are recomputed only on edit or on an explicit "Re-route".

Derived when shown: dates, weather, booking links.

## What updates when

| Change | Recomputed |
|---|---|
| Move or add a via point | Legs and stats of that stage |
| Move a stop | Legs and stats of this and the next stage. The stop is locked. |
| Select a hotel | Stop moves to the hotel and is locked. Same as moving a stop. |
| Change start date | Dates and weather |
| Change profile | Nothing until "Re-route" |
| Add or remove a stage | Re-cuts unlocked stops only |

After an edit, the UI shows downstream changes, e.g. "Day 3 now ends in Lichtenfels".

Stage dates: `startDate + stage index`.

Weather per stage uses the expected time at each point, from `startTime` and `avgSpeed`.

## Storage

D1 table `trips`: `id`, `owner` (email), `name`, `data` (trip as JSON), `summary` (`TripSummary` as JSON, for the trip list), `created_at`, `updated_at`. The trip is always loaded and saved as a whole. The D1 row limit is 2 MB, which is enough.

D1 table `shares`: `trip_id`, `email`.

Schema versions:

- `domain` has a zod schema per version and migration functions between them.
- The Worker migrates on read. The next save writes the new version.
