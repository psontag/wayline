# Trip generation

How Wayline turns a few inputs into trip proposals.

## Input

- Kind: `one-way`, `multi-day-loop` or `day-loop`. A one-way trip of one day is a one-day A to B.
- Region (map area) or start place. One-way: end place (optional).
- Number of days
- Target km per day, max ascent per day. One day: the distance and max ascent.
- Day shares (optional): share of a full day per stage, see below
- Profile, hotel budget, start date, start time, back-by time
- Theme (optional)

## Output

3–5 proposals. Each is a full trip with stages, hotels at stops, stats and, if dated, weather. Proposals should differ from each other, not be small variations of one route.

## Route network

The pipeline turns OSM data into a graph.

- **Nodes**: junctions between signed routes, towns near a route, train stations near a route.
- **Edges**: route sections between nodes.

Each edge carries:

- geometry
- length
- ascent, from the Copernicus DEM (30 m)
- surface share
- score

Each town carries its OSM hotel count. Only towns with at least one hotel can be stops.

Edge score is higher for:

- signed long-distance and EuroVelo routes
- paved surface
- rivers, lakes, forests, nature parks nearby
- no main roads nearby

## Graph first, router last

Search, filtering, stage cutting and ranking run on the graph, without the router. The router is called only:

- for the chosen 3–5 proposals: one multi-waypoint request per stage
- for short connections to stations and towns
- for user edits

## Steps

1. **Load the graph** for the request area: the tiles within half the trip length of the start (loops), or the full length (one-way without an end).
2. **Pick start and end.**
   - A place within 2 km of a station starts or ends at the station. Else at the nearest network node within 5 km of the place.
   - One-way: pairs of stations with the right distance. Prefilter pairs by straight-line distance. If the user picked an end, use only that one.
   - Loops: one place. Start and end are the same.
   - One day from A to B: the direct path first. Then paths up to 20–40 % longer, capped by the distance asked for, that share at most 60 % of the direct one.
3. **Search paths.**
   - Shortest path with cost = length / score^k.
   - Variety: raise the cost of used edges and search again (penalty method).
   - Loops: start → A → B → start. A and B are towns at about 1/3 of the length, at least 12 % of the length away from the start in a straight line, and 40–120° apart as seen from the start.
   - The leg from A to B avoids edges near the start (cost × 8).
   - Time limit of about 2 s.
4. **Filter** by length (within 12 % of the target), ascent and surface, using edge data. Drop loops whose middle part (20–80 % of the length) comes within 4 % of the length, or 4 km, of the start. Drop paths that ride back along themselves: parts within 1.5 km of an earlier part more than 10 km back may add up to 4 % of the length (min 4 km). A short touch, like a river bend, is fine.
5. **Cut into stages.** See below. Each stage becomes one leg per piece of about 10 km, so an edit routes only the legs it touches.
6. **Rank** and pick 3–5 diverse proposals.
7. **Route** the chosen proposals. Waypoints are graph nodes about every 10 km, so the router follows the graph path. Proposals share nodes, so legs hit the cache. If routing fails, the proposal keeps the graph path.
8. **Find hotels** at each stop from the OSM hotel data.
9. **Add weather** if the start date is within the forecast range.

## Stage cutting

Stops must be towns with hotels. For a route of length L and n days:

1. Collect towns near the route with their position (km from start). Only towns with a named hotel within 2 km count.
2. Choose n − 1 towns with dynamic programming. Cost per stage: deviation from its target km. If no cut fits, the path is dropped. Not allowed:
   - a stage that climbs more than its max ascent
   - a stage shorter than 0.5× or longer than 1.35× its target km
   - two stops closer than a quarter of the target km in a straight line
   - on loops: a stop closer to the start than 15 km (or 10 % of the length)
3. Keep up to 3 alternatives per stop: towns with hotels that make the stage about 10 or 20 % shorter or longer, clearly apart from each other and from the stop. Fewer if the path has none.

### Day shares

A full riding day is 09:00 to 17:00. The first day starts at the start time, the last day ends by the back-by time. Their share of a full day is the hours left divided by 8, from 0.25 to 1. Days in between are full.

A stage aims for km per day × share and climbs at most max ascent per day × share. The trip keeps the shares in its settings, so a later version can let the user set them per day.

## Progress and failure

The Web Worker reports phases:

1. loading network
2. searching
3. cutting stages
4. routing n of m

- Proposals appear one by one. The user can cancel.
- If nothing fits, say which limit failed and offer to relax it.

## Other modes

| Mode | How |
|---|---|
| Route A to B (`/route`) | Route directly with the chosen profile. No graph search. |
| One day A to B | Graph search. Each proposal has a character: direct, longer or scenic. |
| Day loop | Graph search for a loop of the given length, without stops. |

## Profiles

| Preset | Routing |
|---|---|
| `touring` | Default. Paved preferred, some gravel OK, avoid main roads. |
| `fast` | Paved, direct, main roads OK. |
| `scenic` | Higher weight on edge score. Detours allowed. |
| `quiet` | Strong penalty on roads with traffic. |

Presets map to custom BRouter profiles.

In the graph search, the profile sets k in cost = length / score^k:

| Preset | k |
|---|---|
| `fast` | 1 |
| `touring` | 2 |
| `quiet` | 2.5 |
| `scenic` | 3 |

## Themes

A theme makes the search prefer edges with that scenery. Edge scenery comes from the pipeline (`Scenery` in `packages/domain/src/geodata.ts`).

| Theme | Edge fit (0–1) | Shown on the proposal |
|---|---|---|
| `nature` | max(forest, ½ × nature reserve share): nature parks include towns | share of km |
| `water` | water share | share of km |
| `wine` | vineyard share × 4, max 1 | share of km in vineyards |
| `culture` | sights per km × 2, max 1 | share of km near a sight |

- Search: the edge score is multiplied by 1 + 1.2 × fit, before the power k.
- Ranking: the proposal score is multiplied by 0.5 + 0.5 × mean fit.
- Without scenery data, a theme changes nothing.

Across the network: forest 43 % of km, nature reserves and parks 29 %, water 17 %, vineyards 1.4 %, near a sight 39 %.

## Climbing

Edges that climb more steeply than the daily average allowed (max ascent per day / km per day) cost more: twice as steep costs twice as much. This keeps hilly forests and valleys from failing the ascent limit.

## Hotel budget

OSM has no prices, so kind and stars stand in for the budget.

| Budget | Hotels that fit |
|---|---|
| `low` | Guest houses, motels, hotels with up to 2 stars |
| `mid` | Up to 3 stars or no stars |
| `high` | Hotels with 3+ stars or no stars |

Stage cutting prefers stops with more hotels that fit. The stop hotel is the nearest one that fits, else the nearest one.
