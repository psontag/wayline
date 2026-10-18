# Trip generation

How Wayline turns a few inputs into trip proposals.

## Input

- Kind: `one-way` or `loop`
- Region (map area) or start station
- Number of days
- Target km per day, max ascent per day
- Profile, hotel budget, start date (optional)

## Output

3–5 proposals. Each is a full trip with stages, hotels at stage ends, stats and, if dated, weather. Proposals should differ from each other, not be small variations of one route.

## Route network

The pipeline turns OSM data into a graph:

- **Nodes**: junctions between signed routes, towns near a route, train stations near a route.
- **Edges**: route sections between nodes. Each has a length, an ascent estimate and a score.

Edge score is higher for:

- signed long-distance and EuroVelo routes
- paved surface
- rivers, lakes, forests, nature parks nearby
- no main roads nearby

The graph is stored as static files on R2 and loaded in the browser for the region.

## Steps

1. **Load the graph** for the region plus a margin.
2. **Pick start and end.**
   - One-way: pairs of stations on the graph with the right distance between them.
   - Loop: one station. Start and end are the same.
3. **Search paths** in the graph.
   - Target length: days × km per day, with a tolerance.
   - Maximize the average edge score.
   - Loops: combine two different paths between the start and a distant node.
   - Keep many candidates. Penalize overlap with already chosen candidates to get variety.
4. **Route the candidates.** Each graph edge becomes a leg, routed by the routing provider. This gives real geometry, elevation and surface. Legs are shared between candidates and cached.
5. **Filter.** Drop candidates that break max ascent or the surface limit.
6. **Cut into stages.** See below.
7. **Find hotels** at each stage end from the OSM hotel data.
8. **Rank** by score and pick 3–5 diverse proposals.
9. **Add weather** if the start date is within 14 days.

## Stage cutting

Stage ends must be towns with hotels. For a route of length L and n days:

1. Collect towns near the route with their position (km from start).
2. Choose n − 1 towns with dynamic programming. Cost per stage: deviation from target km, plus a penalty if ascent exceeds the max.
3. Keep the best 2–3 towns per stage end as alternatives.

The same algorithm runs again when the user changes a stage, but only for the stages after it.

## Other modes

| Mode | How |
|---|---|
| Route A to B | Route directly with the chosen profile. No graph search. |
| Round trip (one day) | Graph search for a loop of the given length. Fallback: OpenRouteService round trip option. |

## Profiles

| Preset | Routing |
|---|---|
| `touring` | Default. Paved preferred, some gravel OK, avoid main roads. |
| `fast` | Paved, direct, main roads OK. |
| `scenic` | Higher weight on edge score. Detours allowed. |
| `quiet` | Strong penalty on roads with traffic. |

Presets map to custom BRouter profiles, and to the closest OpenRouteService profile for the fallback.

## Cost per proposal run

Rough estimate for a 4-day trip:

- Routing: 20–60 legs per candidate, many shared. Mostly cache hits after the first runs in a region.
- Weather: one call per stage.

## Ascent estimate

The pipeline computes ascent per graph edge from a free elevation model (Copernicus DEM, 30 m). Step 3 uses it to drop paths that are too steep before any routing call. The routed legs give the exact values later.

## Hotel check

The pipeline counts OSM hotels per town node. Only towns with at least one hotel are stage end candidates. Ratings and availability are checked by the user on Booking.com.
