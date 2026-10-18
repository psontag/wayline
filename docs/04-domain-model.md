# Domain model

## Entities

```
Trip
 ├─ settings
 └─ Stage[]
     ├─ start: Place
     ├─ end: Place
     ├─ via: Place[]
     ├─ hotel: Hotel?
     └─ Leg[]
```

### Trip

| Field | Description |
|---|---|
| `id`, `name`, `owner` | |
| `kind` | `one-way`, `loop`, `route`, `round-trip` |
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
| `minHotelRating` | Booking.com score, e.g. 8.0 |

### Stage

| Field | Description |
|---|---|
| `start`, `end` | Places. The end of one stage is the start of the next. |
| `via` | User-set via points |
| `hotel` | Selected hotel at the end. Empty on the last stage. |
| `legs` | Derived |
| `stats` | Derived: distance, ascent, descent, surface mix |
| `weather` | Derived, if the date is within the forecast range |

### Place

A point with a type: `station`, `town`, `junction`, `hotel`, `custom`. Stations and towns come from our OSM data.

### Leg

Route between two consecutive points of a stage.

| Field | Description |
|---|---|
| `from`, `to` | Coordinates |
| `geometry` | Line with elevation |
| `distance`, `ascent`, `descent` | |
| `surface` | Share per surface type |
| `provider`, `profile` | Used for the cache key |

### Hotel

OSM id, name, coordinates, stars and website if known. Only the OSM id is stored in the trip. The booking link is built from the hotel, the stage date and the settings.

## Stored vs derived

A saved trip stores only user input and choices:

- trip fields and settings
- per stage: start, end, via points, hotel OSM id

Everything else is derived and cached: legs, stats, weather, hotel details, dates. This keeps saved trips small and always consistent.

## What updates when

| Change | Recomputed |
|---|---|
| Move or add a via point | Legs and stats of that stage |
| Move a stage end | Legs and stats of this and the next stage, hotel suggestions at the new end |
| Select a different hotel | Stage end moves to the hotel. Same as moving a stage end. |
| Change start date | All dates and weather |
| Change profile | All legs |
| Add or remove a stage | Stages from that point on, dates and weather after it |

Stage dates: `startDate + stage index`.

Weather per stage uses the expected time at each point, based on the start time and an average speed.

## Storage

D1 table `trips`: `id`, `owner`, `updated_at`, `data` (trip as JSON). The trip is always loaded and saved as a whole, so one JSON column is enough.

D1 table `shares`: `trip_id`, `email`.
