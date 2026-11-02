# Trip generation

How Wayline turns a few inputs into trip proposals.

## Input

- Kind: `one-way`, `multi-day-loop` or `day-loop`. A one-way trip of one day is a one-day A to B.
- Region (map area) or start place. One-way: end place (optional).
- Number of days
- Target km per day, max ascent per day. One day: the distance and max ascent.
- Day shares (optional): share of a full day per stage, see below
- Hotel budget, start date, start time, back-by time
- With the wind (day trips): plan with the wind forecast of the start date

Every proposal searches and routes with the `touring` profile.

## Output

5–8 proposals where the network allows it. Each is a full trip with stages, hotels at stops, stats, tags and, if dated, weather. Proposals should differ from each other, not be small variations of one route.

Multi-day trips and loops start with one proposal per flavour (see below). One day from A to B starts with proposals with a character. An open day ride starts with proposals to different destinations. The fill step then adds more.

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
7. **Signed routes**, then **fill** up to 8 proposals. See below.
8. **Route** the chosen proposals, all at once. The browser sends at most 3 requests at a time. Waypoints are graph nodes about every 10 km, so the router follows the graph path. Proposals share nodes, so legs hit the cache. If routing fails, the proposal keeps the graph path.
9. **Find hotels** at each stop from the OSM hotel data.
10. **Tag** each proposal. See below.
11. **Add weather** if the start date is within the forecast range.

## Signed routes

Adds up to 3 proposals that follow a named cycle route. Without this, a path only takes what is cheapest between its vias.

- Runs on trips with a known end or a loop, not on rides with the wind.
- Routes count within 1.45 × the trip, there and back. Each needs at least 30 % of the trip unused by other proposals.
- Routes with more than half their km in reach come first, the longest of them. Then the route with the most km no proposal rides yet.
- A route's edges cost × 0.3. Vias are 2 of up to 12 towns on the route.
- Tries the km per day as asked and + 20 %. Estimated length within 10 % of that. A route can so come out about a third longer than asked.
- Keeps the path with the most km on the route, with at least 30 % of its km on it, at most 40 % shared km and at most 60 % in the same corridor as another proposal. It must pass the same filters as all others.
- Skips a route when a proposal already rides more than half of it, for at least 30 % of that proposal.
- Limit: about 2 s, 12 routes, 30 candidates per route and length. A length is given up after 8 candidates in a row that don't fit.

## Seeking climbs

From 12 m/km allowed, the rider wants to climb. Rides with the wind, open rides and one day from A to B do not seek climbs.

- Best, nature, sights and the fill use the hilly climb cost.
- Flavours keep the path that climbs most, until one reaches 85 % of the max ascent. Hilly otherwise aims for 65 %.
- The fill keeps the path that climbs most out of each 15 tries.
- How close a trip gets depends on its roads and length. Heidelberg to Heilbronn at 3 × 60 km and 1000 m reaches about 70 % at most.
- Hilly only has to climb most, not 1.5 × best.
- Flat stays flat. Signed routes use the usual cost, so they follow their route.

## Fill

Adds proposals after the first search, for all trip kinds. It also runs when the first search finds nothing.

It tries these inputs in order. Start, end, days and hotel budget never change.

1. As asked
2. Km per day −20 %
3. Km per day +20 %
4. Max ascent +30 %

For each, a route must pass the first of these steps that still applies:

| Step | Different direction | Shared km | Same corridor | Via gap | Adds up to |
|---|---|---|---|---|---|
| 1 | ≥ 35°, only with a free end | ≤ 40 % | ≤ 60 % | 10 km | 8 |
| 2 | – | ≤ 40 % | ≤ 60 % | 10 km | 8 |
| 3 | – | ≤ 70 % | – | 5 km | 5 |

- Direction: the bearing from the start to the farthest point of the route.
- Same corridor: km within about 2 km of another route, without the parts near both ends. Shared km miss parallel roads, this does not. See `corridor.ts`.
- Via gap: at most 12 % of the trip on short trips.
- Trips of one day have no stops, so any node can be a via, up to about 2000.
- Limit: about 2.5 s, split over the steps. Each step tries up to 60 candidates. The first list of candidates is not counted.
- All flavours together stop after 4 s, so the fill gets its share on large areas.

Routes that fit the inputs come first. Mountain areas with few routes can still get fewer than 5.

`pnpm report:trips` prints count, overlap, time and tags for fixed test trips across Germany, and writes a map per trip to `packages/planner/report/out/index.html`. Use it to tune these numbers.

## Tags

Each proposal gets tags from a fixed list.

The planner sets these when a route is done. Scenery and ways come from the graph path. Length and climbing come from the routed trip.

| Tag | Key | Rule |
|---|---|---|
| Nature | `nature` | ≥ 50 % forest or nature reserves (`nature` theme value) |
| Rivers & lakes | `water` | ≥ 40 % water |
| Wine | `wine` | ≥ 5 % vineyards |
| Sights | `sights` | ≥ 60 % of km near a sight |
| Mostly towns | `urban` | ≥ 25 % of km near a place: 4 km of a city, 1.5 km of a town |
| Scenic | `scenic` | ≥ 2 of nature, water, wine, sights, and Quiet, and not Mostly towns |
| Quiet | `quiet` | ≥ 90 % of km with way quality above 0.95 |
| Gravel | `gravel` | ≥ 30 % of km with way quality 0.78–0.95 |
| Main roads | `mainRoads` | ≥ 15 % of km with way quality up to 0.78 |
| Off signed routes | `offRoutes` | < 50 % of km on signed routes |
| Flat | `flat` | ≤ 1.5 m of climbing per km |
| Hilly | `hilly` | ≥ 5 m per km |
| Lots of climbing | `climbs` | ≥ 8 m per km. Replaces Hilly. |
| Longer, Shorter | `longer`, `shorter` | ≥ 10 % off the target km. Not on one day from A to B, which has a character. |
| More climbing | `moreClimbing` | A stage over its max ascent by more than 5 % |

The app adds the rest. See `06-ui.md`.

## Stage cutting

Stops must be towns with hotels. For a route of length L and n days:

1. Collect towns within 2 km of the route with their position (km from start). Only towns with a named hotel within 5 km count.
2. Choose n − 1 towns with dynamic programming. Cost per stage: deviation from its target km. Each stop costs less with more hotels in town (within 2 km) that fit the budget, and more with fewer than 3. A town with 3 hotels is worth about 12 km more on a 70 km day than one with 2. If no cut fits, the path is dropped. Not allowed:
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
- Up to 5 proposals before the fill, no flavours.

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

Presets map to custom BRouter profiles. Proposals use `touring`. Imported trips can use any preset.

In the graph search, k = 2 in cost = length / score^k.

## Scenery

Scenery flavours and tags use these measures. Edge scenery comes from the pipeline (`Scenery` in `packages/domain/src/geodata.ts`).

| Measure | Edge fit (0–1) | Share on a proposal |
|---|---|---|
| `nature` | max(forest, ½ × nature reserve share): nature parks include towns | share of km |
| `water` | water share | share of km |
| `wine` | vineyard share × 4, max 1 | share of km in vineyards |
| `culture` | sights per km × 2, max 1 | share of km near a sight |

- Scenery flavours multiply the edge score by 1 + 1.2 × fit × q², before the power k. q is the way quality: edge score / network class score (paved and quiet 1, gravel 0.85, main road 0.7). So scenery on gravel or next to a main road does not beat a paved, quiet way with a bit less scenery.

Across the network: forest 43 % of km, nature reserves and parks 29 %, water 17 %, vineyards 1.4 %, near a sight 39 %.

## Flavours

Each flavour searches with its own edge costs.

| Flavour | Edge cost |
|---|---|
| `best` | The usual cost |
| `nature` | Boosts forest, nature reserves and water together: 1 − (1 − green)(1 − water) |
| `flat` | Climb factor × (1 + climb / average allowed) |
| `hilly` | (max(1, s))² / (1 + 30 × min(s, 1)), s = climb / average allowed. Keeps the path that climbs most of its tries, until one reaches 65 % of the max ascent. Stages still keep the max ascent. |
| `sights` | Boosts max(culture, wine) |

- Order: best first, then the rest.
- Flat and hilly are searched last, so they can be held to the least and the most climbing.
- Each flavour raises the cost of edges of earlier proposals ×2, once per edge (penalty method), and tries candidates best first. After the first proposal, each flavour gets about 60 candidates or 1.5 s.
- If a flavour's first path has stops with fewer than 3 hotels, it tries up to 15 more candidates and keeps the one with the fewest such stops.
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

Ascent drops rises and falls under 10 m (hysteresis on the elevation profile). The DEM is a surface model, so trees and buildings add noise.

- Stages and paths filter along the whole path, across edge ends. On 59 stages in six regions this comes out 12 % above BRouter (median 5 %). Filtering each edge alone gave 30 % more, unfiltered about 3×.
- Edge costs use each edge's own filtered ascent.

Edges that climb more steeply than a share of the daily average allowed (max ascent per day / km per day) cost more: twice as steep costs twice as much. The share is daily average / 12 m/km, from 40 % to 100 %. So from 12 m/km on, climbing at the average costs nothing, and a low limit still avoids hills.

## Hotel budget

OSM has no prices, so kind and stars stand in for the budget.

| Budget | Hotels that fit |
|---|---|
| `low` | Guest houses, motels, hotels with up to 2 stars |
| `mid` | Up to 3 stars or no stars |
| `high` | Hotels with 3+ stars or no stars |

Stage cutting prefers stops with more hotels that fit. The stop hotel is the nearest one that fits, else the nearest one.
