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
| `NewTripV2.dc.html` | New trip: one form for one day or several days, loop or A to B, with dates that set short days |
| `ProposalsV2.dc.html` | Proposals with the days on every card and on the map |
| `TripEditorV2.dc.html` | Trip editor after a route change: proposed route, Revert, stop alternatives |

Each file has a `light` and a `dark` token set in its script block. The tokens in `packages/ui/src/tokens.css` must match them.

When the canvas changes, copy the changed files here.

## Proposals

| File | Content |
|---|---|
| `wind-proposals/index.html` | Options for wind-aware trips (#135). Plain HTML. Live page: https://claude.ai/artifact/2frmGoLdX5oPQYLJvcQsnM (private). |
| `trip-panel/` | Side panel of the trip editor (#164): options A to C and the click dummy of C (`Prototype.dc.html`). Needs the canvas runtime. Live canvas: https://claude.ai/artifact/FEJvVqgHbqwASZejCccgAx (private). |
