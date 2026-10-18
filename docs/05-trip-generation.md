# Trip generation

How Wayline turns a few inputs into trip proposals.

## Input

- Kind: `one-way` or `multi-day-loop`
- Region (map area) or start station
- Number of days
- Target km per day, max ascent per day
- Profile, hotel budget, start date (optional)

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

1. **Load the graph** for the region.
2. **Pick start and end.**
   - One-way: pairs of stations with the right distance. Prefilter pairs by straight-line distance.
   - Multi-day loop: one station. Start and end are the same.
3. **Search paths.**
   - Shortest path with cost = length / score^k.
   - Variety: raise the cost of used edges and search again (penalty method).
   - Loops: two penalized paths to a turning node at about 1/3 of the length.
   - Time limit of about 2 s.
4. **Filter** by length, ascent and surface, using edge data.
5. **Cut into stages.** See below.
6. **Rank** and pick 3–5 diverse proposals.
7. **Route** the chosen proposals.
8. **Find hotels** at each stop from the OSM hotel data.
9. **Add weather** if the start date is within the forecast range.

## Stage cutting

Stops must be towns with hotels. For a route of length L and n days:

1. Collect towns near the route with their position (km from start).
2. Choose n − 1 towns with dynamic programming. Cost per stage: deviation from target km, plus a penalty if ascent exceeds the max.
3. Keep the best 2–3 towns per stop as alternatives.

On edit, cutting runs only between locked stops.

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
| Route A to B | Route directly with the chosen profile. No graph search. |
| Day loop | Graph search for a loop of the given length. |

## Profiles

| Preset | Routing |
|---|---|
| `touring` | Default. Paved preferred, some gravel OK, avoid main roads. |
| `fast` | Paved, direct, main roads OK. |
| `scenic` | Higher weight on edge score. Detours allowed. |
| `quiet` | Strong penalty on roads with traffic. |

Presets map to custom BRouter profiles.
