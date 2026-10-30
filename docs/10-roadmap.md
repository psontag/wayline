# Roadmap

Vertical slices. Look and feel first. Each slice ends with a working, deployed app.

## 1. Base

- Monorepo, CI
- Cloudflare Access
- Design tokens, first components, light and dark mode
- Translation setup
- Map page

## 2. Routing end to end

- BRouter through the Worker, legs cached in D1
- Route on the map with elevation profile
- Via points
- GPX export
- Deploy

## 3. Network spike

Tests the biggest risk early.

- Build the route network for one region
- Node script that writes proposal GPX files

## 4. Trips

- Save in D1
- Trip list
- Autosave
- Sharing

## 5. Manual multi-day trips

Before: test which Booking.com URL filters work.

- Stages with locked stops
- One editor for every planned trip: route dragging on every day, revert to the proposal
- Weather with wind
- OSM hotels
- Booking.com and bahn.de links
- Undo

## 6. Trip generator

- Proposals with progress
- Stage alternatives
- One form for one day or several days, loop or A to B
- Shorter first and last days from the start and back-by times

## 7. Day loops

- Loop suggestions for a start point and distance. Part of the one form, done with the editor work.

## 8. Polish

Current focus. Small fixes, look and feel.

## Later

- Router in a Cloudflare Worker instead of the tunnel to a local BRouter
- Open items of slices 5–7: bahn.de links with date, time and home station; climbing and hotel stops
- Route data for all of Germany
- Custom domain
- ORS fallback
- Rate limiter and budget
- Usage page
- Playwright tests
- PWA install
- Live train connections
- Planning with an LLM
