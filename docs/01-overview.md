# Overview

Wayline is a web app for planning bike trips, mainly multi-day trips. You enter a few parameters. Wayline proposes routes split into daily stages, with hotels and weather. When you edit a trip, everything that depends on the change is updated.

Users: me, plus a few friends who can view shared trips.

## Problem

Planning a multi-day trip in an unknown region takes a lot of manual work:

- Finding good routes needs local knowledge. Komoot connects A to B, but doesn't suggest where a good 4-day trip goes.
- Splitting a route into days is done by hand.
- Hotels, weather and trains are in separate tools. Dates and places must be entered again in each.
- One change affects many things. Moving an overnight stop changes two stages, the dates, the weather and the hotel options.

## Features

| Feature | Description |
|---|---|
| Multi-day planner | Input: region or start point, days, km per day, max climbing per day, hotel budget. Output: several trip proposals, split into daily stages. Routes follow signposted cycling routes. One-way trips and multi-day loops. |
| Stage alternatives | Several options per day, e.g. shorter, longer, or a different town. The following stages adjust. |
| Hotels | Hotels at each stage end. Booking.com link with dates, budget and minimum rating filled in. |
| Weather | Forecast per stage for the time you ride there, including wind direction relative to the route. Up to 14 days ahead. |
| Train stations | Start and end points can be train stations. |
| Route planning | A to B with presets: fast, scenic, quiet. |
| Day loops | Loop suggestions for a start point and distance. |
| Editing | Change route, stages or hotels. Distances, elevation, dates, weather and hotels update automatically. |
| GPX export | Per trip or per stage, e.g. for komoot. |
| Sharing | Friends can view trips. |

## Scope

- Region: Germany. Austria, Switzerland and France later.
- Riding style: mostly paved and quiet roads. Some forest and farm tracks are fine. No pushing or carrying the bike.
- Hotels only.
- Planning only. Navigation happens in other apps via GPX.

## Later

- Rest days and uneven stage lengths
- Live hotel prices and availability
- Friends can edit trips
- GPX import
- Planning with an LLM
- Mobile app

## Not planned

- Turn-by-turn navigation
- Booking inside the app
- Camping or huts
- Mountain bike routes
