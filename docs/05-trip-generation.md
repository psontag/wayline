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
- With the wind (day trips): plan with the wind forecast of the start date

## Output

Up to 5 proposals. Each is a full trip with stages, hotels at stops, stats and, if dated, weather. Proposals should differ from each other, not be small variations of one route.

Multi-day trips and loops get one proposal per flavour (see below). One day from A to B gets proposals with a character instead. An open day ride gets proposals to different destinations.

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

- for the chosen proposals: one multi-waypoint request per stage
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
6. **Pick** one proposal per flavour, or up to 5 diverse ones for one day from A to B.
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
| One day A to B | Graph search. Each proposal has a character: direct, longer or scenic. No flavours. |
| Day loop | Graph search for a loop of the given length, without stops. |
| Open day ride | One-way, one day, no end. Graph search to any station. See below. |

## Open day ride

Ride in any direction and take the train home.

- Proposals go to stations at least 45° apart, seen from the start, and at least 10 km apart. A second pass drops the angle when too few fit.
- Each proposal is named after its destination: "To Schweinfurt".
- Up to 5 proposals, no flavours.

## Wind

Day loops and open day rides plan with the wind when the user turns it on ("With the wind", on by default) and the start date is within the forecast. The web app loads the hourly forecast at the start and passes it to the planner. Without a forecast, nothing changes.

Each candidate gets a wind factor. Its parts are straight lines through its nodes, scaled to the trip length. Each part uses the wind of the hour it is ridden, at 18 km/h from the start time.

| Rule | Value |
|---|---|
| Head part h | wind speed × cos(wind from − riding direction) |
| Cost of a part | h when h > 0 (headwind), ½ h when h < 0 (a tailwind helps less) |
| Late headwind | Weight 0.8 at the start to 1.2 at the end of the ride |
| Factor | 1 + 0.6 × mean cost / 25 km/h, at least 0.5 |
| Calm | Hours below 10 km/h count as no wind |

- The candidate quality is multiplied by the factor, so rides with the wind are tried first.
- Loops: each loop is tried in the direction with the lower factor. Out against the wind, back with it, wins.
- Open rides: each ride is also tried the other way round, from the station back to the start ("train out, ride home"), when that has a tailwind. It costs 10 % more and at most one such proposal is shown.
- Open rides are shown with the wind first: by factor, rounded to 0.1, then search order.

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

- Search: the edge score is multiplied by 1 + 1.2 × fit × q², before the power k. q is the way quality: edge score / network class score (paved and quiet 1, gravel 0.85, main road 0.7). So scenery on gravel or next to a main road does not beat a paved, quiet way with a bit less scenery.
- Ranking: the proposal score is multiplied by 0.5 + 0.5 × mean fit.
- Without scenery data, a theme changes nothing.

Across the network: forest 43 % of km, nature reserves and parks 29 %, water 17 %, vineyards 1.4 %, near a sight 39 %.

## Flavours

Each flavour searches with its own edge costs.

| Flavour | Edge cost |
|---|---|
| `best` | The usual cost, without the theme |
| `nature` | Boosts forest, nature reserves and water together: 1 − (1 − green)(1 − water) |
| `flat` | Climb factor × (1 + climb / average allowed) |
| `hilly` | (max(1, s))² / (1 + 30 × min(s, 1)), s = climb / average allowed. Keeps the path that climbs most of its tries, until one reaches 65 % of the max ascent. Stages still keep the max ascent. |
| `sights` | Boosts max(culture, wine) |

- Order: the flavour of the form theme first (`nature`, `water` → nature; `culture`, `wine` → sights), then best, then the rest.
- Flat and hilly are searched last, so they can be held to the least and the most climbing.
- Each flavour raises the cost of edges of earlier proposals ×2, once per edge (penalty method), and tries candidates best first. After the first proposal, each flavour gets about 60 candidates or 1.5 s.
- A flavour is dropped when its path shares more than 40 % of its km with an earlier proposal, or when it adds nothing over best:

| Flavour | Needs |
|---|---|
| `nature` | ≥ 50 % fit, and 8 points more than best |
| `sights` | ≥ 20 % fit, and 5 points more than best |
| `flat` | ≤ 85 % of the ascent of best, and less than every other proposal |
| `hilly` | ≥ 1.5 × the ascent of best, and more than every other proposal |

- Without scenery data there is no nature or sights flavour.
- Each proposal has `signedShare`: the share of km on signed cycle routes.

## Climbing

Edge ascent drops rises and falls under 10 m (hysteresis on the edge profile). The DEM is a surface model, so trees add noise. Without the filter, ascent comes out about 3× what the router reports.

Edges that climb more steeply than 40 % of the daily average allowed (max ascent per day / km per day) cost more: twice as steep costs twice as much.

## Hotel budget

OSM has no prices, so kind and stars stand in for the budget.

| Budget | Hotels that fit |
|---|---|
| `low` | Guest houses, motels, hotels with up to 2 stars |
| `mid` | Up to 3 stars or no stars |
| `high` | Hotels with 3+ stars or no stars |

Stage cutting prefers stops with more hotels that fit. The stop hotel is the nearest one that fits, else the nearest one.
