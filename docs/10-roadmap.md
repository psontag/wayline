# Roadmap

Each milestone ends with a working, deployed app.

## 1. Base

- Monorepo, CI, deploy to Cloudflare
- Cloudflare Access login
- Design tokens, first components, light and dark mode
- Translation setup
- Map page

## 2. Route A to B

- Routing through the Worker: BRouter adapter, cache, rate limit
- ORS fallback
- Route on the map with distance, ascent and elevation profile
- Via points by dragging the route
- GPX export

## 3. Trips

- Save trips in D1
- Trip list
- Share a trip for viewing

## 4. Manual multi-day trips

- Split a route into stages by hand
- Stage dates and weather with wind
- Hotels at stage ends
- Booking links
- Automatic updates on edit

## 5. Data pipeline

- OSM extracts to route network, towns and stations on R2
- Ascent estimate per edge
- Hotel count per town
- Overlay of signed cycling routes on the map

## 6. Trip generator

- Proposals for one-way trips and loops
- Automatic stage cutting
- Stage alternatives
- Start and end at train stations

## 7. Round trips

- Loop suggestions for a start point and distance
