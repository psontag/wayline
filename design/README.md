# Design

Mockups for Wayline. The live canvas is at https://claude.ai/artifact/ChsmLYfE8BsrKg193GxHFE (private). The files in `canvas/` are copies for reference.

The files need the canvas runtime to render. Read them as HTML and CSS: they hold the exact colors, sizes and layouts.

| File | Content |
|---|---|
| `Peach.dc.html` + `Tile.dc.html` | Style tile in light and dark. Source for the color tokens. |
| `TripList.dc.html` | Trip list and empty state |
| `NewTrip.dc.html` | New trip form with region on the map |
| `Proposals.dc.html` | Proposals: generating, done, no result |
| `TripEditor.dc.html` | Trip editor: map, stage cards, elevation and weather |
| `PhoneTrip.dc.html` | Phone trip view with bottom sheet |
| `PhoneStage.dc.html` | Phone stop and hotel picker |
| `PhoneList.dc.html` | Phone trip list |

Each file has a `light` and a `dark` token set in its script block. The tokens in `packages/ui/src/tokens.css` must match them.

When the canvas changes, copy the changed files here.
